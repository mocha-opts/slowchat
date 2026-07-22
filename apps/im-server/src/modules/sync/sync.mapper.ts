import type { SyncEvent } from "@im/contracts/api";

import type { UserSyncEventEntity } from "./persistence/entities/user-sync-event.entity.js";

export function toSyncEvent(value: UserSyncEventEntity): SyncEvent {
  return {
    id: safeNumber(value.id),
    eventId: value.eventId,
    userId: value.userId,
    eventType: value.eventType as SyncEvent["eventType"],
    eventVersion: value.eventVersion as 1,
    entityType: value.entityType,
    entityId: value.entityId,
    conversationId: value.conversationId,
    seq: value.seq === null ? null : safeNumber(value.seq),
    payload: value.payload,
    createdAt: value.createdAt.toISOString(),
  };
}

function safeNumber(value: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error("Sync cursor exceeds JavaScript safe integer");
  return result;
}
