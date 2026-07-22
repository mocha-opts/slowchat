import { z } from "zod";

import { uuidSchema } from "../api/common.js";
import { conversationSchema } from "../api/conversations.js";
import { messageSchema, receiptSchema } from "../messages/index.js";

/**
 * 媒体状态事件只携带业务元数据，不携带 Object Key 或预签名 URL。
 * 这样同步日志即使被复制到客户端，也不会扩大对象存储的访问面。
 */
export const mediaStatusEventDataSchema = z.object({
  attachmentId: uuidSchema,
  ownerId: uuidSchema,
  kind: z.enum(["IMAGE", "FILE"]),
  status: z.enum(["READY", "FAILED", "QUARANTINED"]),
  metadata: z.record(z.string(), z.unknown()),
  failureReason: z.string().nullable(),
});
export type MediaStatusEventData = z.infer<typeof mediaStatusEventDataSchema>;

export const domainEventTypeSchema = z.enum([
  "conversation.created.v1",
  "conversation.updated.v1",
  "message.created.v1",
  "receipt.updated.v1",
  "media.ready.v1",
  "media.failed.v1",
  "media.quarantined.v1",
]);
export type DomainEventType = z.infer<typeof domainEventTypeSchema>;

const domainEventBaseSchema = z.object({
  eventId: uuidSchema,
  eventType: domainEventTypeSchema,
  eventVersion: z.literal(1),
  occurredAt: z.iso.datetime(),
  aggregateType: z.enum(["conversation", "message", "receipt", "attachment"]),
  aggregateId: uuidSchema,
  actorUserId: uuidSchema,
  audienceUserIds: z.array(uuidSchema).min(1),
  requestId: z.string().min(1).optional(),
  traceId: z.string().min(1).optional(),
});

export const domainEventEnvelopeSchema = domainEventBaseSchema.extend({ data: z.unknown() });
export type DomainEventEnvelope<T = unknown> = Omit<
  z.infer<typeof domainEventEnvelopeSchema>,
  "data"
> & { data: T };

export const conversationCreatedEventSchema = domainEventBaseSchema.extend({
  eventType: z.literal("conversation.created.v1"),
  aggregateType: z.literal("conversation"),
  data: conversationSchema,
});
export const conversationUpdatedEventSchema = domainEventBaseSchema.extend({
  eventType: z.literal("conversation.updated.v1"),
  aggregateType: z.literal("conversation"),
  data: conversationSchema,
});
export const messageCreatedEventSchema = domainEventBaseSchema.extend({
  eventType: z.literal("message.created.v1"),
  aggregateType: z.literal("message"),
  data: messageSchema,
});
export const receiptUpdatedEventSchema = domainEventBaseSchema.extend({
  eventType: z.literal("receipt.updated.v1"),
  aggregateType: z.literal("receipt"),
  data: receiptSchema,
});

const mediaStatusBaseEventSchema = domainEventBaseSchema.extend({
  aggregateType: z.literal("attachment"),
  data: mediaStatusEventDataSchema,
});

export const mediaReadyEventSchema = mediaStatusBaseEventSchema.extend({
  eventType: z.literal("media.ready.v1"),
  data: mediaStatusEventDataSchema.extend({ status: z.literal("READY") }),
});
export const mediaFailedEventSchema = mediaStatusBaseEventSchema.extend({
  eventType: z.literal("media.failed.v1"),
  data: mediaStatusEventDataSchema.extend({ status: z.literal("FAILED") }),
});
export const mediaQuarantinedEventSchema = mediaStatusBaseEventSchema.extend({
  eventType: z.literal("media.quarantined.v1"),
  data: mediaStatusEventDataSchema.extend({ status: z.literal("QUARANTINED") }),
});

export const p3DomainEventSchema = z.discriminatedUnion("eventType", [
  conversationCreatedEventSchema,
  conversationUpdatedEventSchema,
  messageCreatedEventSchema,
  receiptUpdatedEventSchema,
  mediaReadyEventSchema,
  mediaFailedEventSchema,
  mediaQuarantinedEventSchema,
]);
export type P3DomainEvent = z.infer<typeof p3DomainEventSchema>;
