import { randomUUID } from "node:crypto";
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { p3DomainEventSchema, type P3DomainEvent } from "@im/contracts/events";
import type { WsServerEvent } from "@im/contracts/websocket";
import type { ConsumeMessage } from "amqplib";
import { DataSource } from "typeorm";

import { APP_CONFIG, type AppConfig } from "../../../platform/config/app-config.js";
import {
  PermanentRabbitMessageError,
  RabbitMqService,
} from "../../../platform/rabbitmq/rabbitmq.service.js";
import { RealtimeEventPublisherService } from "../../../platform/realtime/realtime-event-publisher.service.js";
import { ConsumerInboxEventEntity } from "../persistence/entities/consumer-inbox-event.entity.js";

const CONSUMER_NAME = "realtime-dispatch.v1";

@Injectable()
export class RealtimeDispatchService implements OnModuleInit {
  private readonly workerId = `realtime-${process.pid}-${randomUUID()}`;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly rabbitMq: RabbitMqService,
    private readonly realtime: RealtimeEventPublisherService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbitMq.consumeRealtime((message) => this.dispatch(message));
  }

  async dispatch(message: ConsumeMessage): Promise<void> {
    let decoded: unknown;
    try {
      decoded = JSON.parse(message.content.toString("utf8"));
    } catch {
      throw new PermanentRabbitMessageError("RabbitMQ payload is not valid JSON");
    }
    const result = p3DomainEventSchema.safeParse(decoded);
    if (!result.success) {
      throw new PermanentRabbitMessageError("RabbitMQ payload does not match a supported event");
    }
    const event = result.data;
    const claim = await this.claim(event);
    if (claim === "PROCESSED") return;
    if (claim === "BUSY") throw new Error("Event is already being processed");
    try {
      await this.realtime.emitEnvelopeToUsers(toRealtimeEvent(event), event.audienceUserIds);
      await this.dataSource.getRepository(ConsumerInboxEventEntity).update(
        { consumerName: CONSUMER_NAME, eventId: event.eventId, lockedBy: this.workerId },
        {
          status: "PROCESSED",
          processedAt: new Date(),
          lockedBy: null,
          lockedUntil: null,
          lastError: null,
        },
      );
    } catch (error) {
      await this.dataSource
        .getRepository(ConsumerInboxEventEntity)
        .update(
          { consumerName: CONSUMER_NAME, eventId: event.eventId, lockedBy: this.workerId },
          { lockedUntil: new Date(0), lastError: safeError(error) },
        );
      throw error;
    }
  }

  private async claim(event: P3DomainEvent): Promise<"CLAIMED" | "PROCESSED" | "BUSY"> {
    const rows = await this.dataSource.query<Array<{ status: string }>>(
      `INSERT INTO consumer_inbox_events(
         consumer_name, event_id, event_type, status, attempts, locked_by, locked_until
       ) VALUES ($1, $2, $3, 'PROCESSING', 1, $4,
         now() + ($5::text || ' milliseconds')::interval)
       ON CONFLICT (consumer_name, event_id) DO UPDATE
         SET status = 'PROCESSING', attempts = consumer_inbox_events.attempts + 1,
             locked_by = EXCLUDED.locked_by, locked_until = EXCLUDED.locked_until,
             last_error = NULL
       WHERE consumer_inbox_events.status <> 'PROCESSED'
         AND (consumer_inbox_events.locked_until IS NULL OR consumer_inbox_events.locked_until < now())
       RETURNING status`,
      [
        CONSUMER_NAME,
        event.eventId,
        event.eventType,
        this.workerId,
        this.config.messaging.consumerLeaseMs,
      ],
    );
    if (rows.length > 0) return "CLAIMED";
    const existing = await this.dataSource.getRepository(ConsumerInboxEventEntity).findOneBy({
      consumerName: CONSUMER_NAME,
      eventId: event.eventId,
    });
    return existing?.status === "PROCESSED" ? "PROCESSED" : "BUSY";
  }
}

function toRealtimeEvent(event: P3DomainEvent): WsServerEvent {
  return {
    version: 1,
    event: event.eventType.replace(/\.v1$/, ""),
    eventId: event.eventId,
    serverTimestamp: Date.parse(event.occurredAt),
    ...(event.traceId ? { traceId: event.traceId } : {}),
    data: event.data,
  };
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : "Unknown dispatch error").slice(0, 1000);
}
