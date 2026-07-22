import { randomUUID } from "node:crypto";
import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { PinoLogger } from "nestjs-pino";
import { DataSource, In } from "typeorm";

import { APP_CONFIG, type AppConfig } from "../../../platform/config/app-config.js";
import { RABBIT_TOPOLOGY, RabbitMqService } from "../../../platform/rabbitmq/rabbitmq.service.js";
import { OutboxEventEntity } from "../persistence/entities/outbox-event.entity.js";

@Injectable()
export class OutboxRelayService implements OnModuleInit, OnApplicationShutdown {
  private readonly workerId = `outbox-${process.pid}-${randomUUID()}`;
  private timer: NodeJS.Timeout | undefined;
  private stopping = false;
  private inFlight: Promise<void> | undefined;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly rabbitMq: RabbitMqService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OutboxRelayService.name);
  }

  onModuleInit(): void {
    this.schedule(0);
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    await this.inFlight;
  }

  async runOnce(): Promise<number> {
    if (!this.rabbitMq.isPublisherReady()) return 0;
    const events = await this.claim();
    for (const event of events) await this.publish(event);
    return events.length;
  }

  private schedule(delay: number): void {
    if (this.stopping) return;
    this.timer = setTimeout(() => {
      this.inFlight = this.runOnce()
        .catch((error: unknown) =>
          this.logger.error({ err: error }, "Outbox relay iteration failed"),
        )
        .then(() => undefined)
        .finally(() => {
          this.inFlight = undefined;
          this.schedule(this.config.messaging.outboxPollIntervalMs);
        });
    }, delay);
    this.timer.unref();
  }

  private async claim(): Promise<OutboxEventEntity[]> {
    const result = await this.dataSource.query<[Array<{ id: string | number }>, number]>(
      `UPDATE outbox_events
          SET status = 'PROCESSING', locked_by = $1,
              locked_until = now() + ($2::text || ' milliseconds')::interval
        WHERE id IN (
          SELECT id FROM outbox_events
           WHERE (status = 'PENDING' AND available_at <= now())
              OR (status = 'PROCESSING' AND locked_until < now())
           ORDER BY created_at, id
           FOR UPDATE SKIP LOCKED
           LIMIT $3
        )
        RETURNING id`,
      [this.workerId, this.config.messaging.outboxLockMs, this.config.messaging.outboxBatchSize],
    );
    const ids = result[0].map((row) => String(row.id));
    if (ids.length === 0) return [];
    return this.dataSource.getRepository(OutboxEventEntity).find({
      where: { id: In(ids) },
      order: { createdAt: "ASC", id: "ASC" },
    });
  }

  private async publish(event: OutboxEventEntity): Promise<void> {
    try {
      await this.rabbitMq.publish(
        RABBIT_TOPOLOGY.domainExchange,
        event.routingKey,
        Buffer.from(JSON.stringify(event.payload)),
        {
          messageId: event.eventId,
          correlationId:
            typeof event.headers.requestId === "string" ? event.headers.requestId : event.eventId,
          timestamp: Math.floor(event.createdAt.getTime() / 1000),
          type: event.eventType,
          headers: event.headers,
        },
      );
      await this.dataSource.getRepository(OutboxEventEntity).update(
        { id: event.id, lockedBy: this.workerId },
        {
          status: "PUBLISHED",
          publishedAt: new Date(),
          lockedBy: null,
          lockedUntil: null,
          lastError: null,
        },
      );
    } catch (error) {
      const attempts = event.attempts + 1;
      const failed = attempts >= this.config.messaging.outboxMaxAttempts;
      const delay = outboxRetryDelay(
        attempts,
        this.config.messaging.outboxRetryBaseMs,
        this.config.messaging.outboxRetryMaxMs,
      );
      await this.dataSource.getRepository(OutboxEventEntity).update(
        { id: event.id, lockedBy: this.workerId },
        {
          status: failed ? "FAILED" : "PENDING",
          attempts,
          availableAt: new Date(Date.now() + delay),
          lockedBy: null,
          lockedUntil: null,
          lastError: safeError(error),
        },
      );
      this.logger.warn(
        { err: error, eventId: event.eventId, attempts, failed },
        "Outbox event publish failed",
      );
    }
  }
}

export function outboxRetryDelay(attempt: number, baseMs: number, maxMs: number): number {
  const exponential = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(exponential * 0.2 * Math.random());
  return Math.min(maxMs, exponential + jitter);
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : "Unknown publisher error").slice(0, 1000);
}
