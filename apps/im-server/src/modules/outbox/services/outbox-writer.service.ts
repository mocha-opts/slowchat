import { Injectable } from "@nestjs/common";
import type { DomainEventEnvelope } from "@im/contracts/events";
import type { EntityManager } from "typeorm";

import { OutboxEventEntity } from "../persistence/entities/outbox-event.entity.js";

@Injectable()
export class OutboxWriterService {
  async append(manager: EntityManager, event: DomainEventEnvelope): Promise<void> {
    const repository = manager.getRepository(OutboxEventEntity);
    const record = repository.create({
      eventId: event.eventId,
      eventType: event.eventType,
      eventVersion: event.eventVersion,
      routingKey: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event as unknown as Record<string, unknown>,
      headers: {
        ...(event.requestId ? { requestId: event.requestId } : {}),
        ...(event.traceId ? { traceId: event.traceId } : {}),
      },
      status: "PENDING",
      attempts: 0,
      availableAt: new Date(),
      lockedBy: null,
      lockedUntil: null,
      publishedAt: null,
      lastError: null,
    });
    await repository.save(record);
  }
}
