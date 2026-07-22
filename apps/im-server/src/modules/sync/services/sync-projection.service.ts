import { randomUUID } from "node:crypto";
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { p3DomainEventSchema, type P3DomainEvent } from "@im/contracts/events";
import type { ConsumeMessage } from "amqplib";
import { DataSource } from "typeorm";

import { APP_CONFIG, type AppConfig } from "../../../platform/config/app-config.js";
import {
  PermanentRabbitMessageError,
  RabbitMqService,
} from "../../../platform/rabbitmq/rabbitmq.service.js";
import { ConsumerInboxEventEntity } from "../../outbox/persistence/entities/consumer-inbox-event.entity.js";

const CONSUMER_NAME = "sync-projection.v1";

/**
 * 将可靠领域事件投影成用户级增量事件。
 * 投影只增加可重放索引，不修改会话或消息事实，因此可以安全重试。
 */
@Injectable()
export class SyncProjectionService implements OnModuleInit {
  private readonly workerId = `sync-${process.pid}-${randomUUID()}`;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly rabbitMq: RabbitMqService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbitMq.consumeSync((message) => this.project(message));
  }

  async project(message: ConsumeMessage): Promise<void> {
    let value: unknown;
    try {
      value = JSON.parse(message.content.toString("utf8"));
    } catch {
      throw new PermanentRabbitMessageError("Sync event is not valid JSON");
    }
    const parsed = p3DomainEventSchema.safeParse(value);
    if (!parsed.success) {
      throw new PermanentRabbitMessageError("Sync event version is unsupported");
    }
    const event = parsed.data;
    if (!(await this.claimInbox(event))) return;

    try {
      await this.dataSource.transaction(async (manager) => {
        const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
        const seq = readSeq(event.data);
        for (const userId of new Set(event.audienceUserIds)) {
          // 唯一键 (user_id,event_id) 是并发投影时的最终幂等防线。
          await manager.query(
            `INSERT INTO user_sync_events(
               user_id, event_id, event_type, event_version, entity_type,
               entity_id, conversation_id, seq, payload, created_at, expires_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10)
             ON CONFLICT (user_id,event_id) DO NOTHING`,
            [
              userId,
              event.eventId,
              event.eventType,
              event.eventVersion,
              event.aggregateType,
              event.aggregateId,
              readConversationId(event.data),
              seq,
              event.data,
              expiresAt,
            ],
          );
        }
      });
      await this.dataSource
        .getRepository(ConsumerInboxEventEntity)
        .update(
          { consumerName: CONSUMER_NAME, eventId: event.eventId, lockedBy: this.workerId },
          { status: "PROCESSED", processedAt: new Date(), lockedBy: null, lockedUntil: null },
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

  private async claimInbox(event: P3DomainEvent): Promise<boolean> {
    const rows = await this.dataSource.query<Array<{ status: string }>>(
      `INSERT INTO consumer_inbox_events(
         consumer_name,event_id,event_type,status,attempts,locked_by,locked_until
       ) VALUES ($1,$2,$3,'PROCESSING',1,$4,now()+($5::text||' milliseconds')::interval)
       ON CONFLICT (consumer_name,event_id) DO UPDATE
       SET status='PROCESSING', attempts=consumer_inbox_events.attempts+1,
           locked_by=EXCLUDED.locked_by, locked_until=EXCLUDED.locked_until, last_error=NULL
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
    if (rows.length > 0) return true;
    const existing = await this.dataSource.getRepository(ConsumerInboxEventEntity).findOneBy({
      consumerName: CONSUMER_NAME,
      eventId: event.eventId,
    });
    if (existing?.status === "PROCESSED") return false;
    throw new Error("Sync event is already being projected");
  }
}

function readSeq(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const seq = (value as { seq?: unknown }).seq;
  return typeof seq === "number" && Number.isSafeInteger(seq) ? String(seq) : null;
}

function readConversationId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const id = (value as { conversationId?: unknown }).conversationId;
  if (typeof id === "string") return id;
  const conversationId = (value as { id?: unknown }).id;
  return typeof conversationId === "string" ? conversationId : null;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : "Unknown projection error").slice(0, 1000);
}
