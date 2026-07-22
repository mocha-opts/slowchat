import { z } from "zod";

import { uuidSchema } from "../api/common.js";
import { conversationSchema } from "../api/conversations.js";
import { messageSchema, receiptSchema } from "../messages/index.js";

export const domainEventTypeSchema = z.enum([
  "conversation.created.v1",
  "conversation.updated.v1",
  "message.created.v1",
  "receipt.updated.v1",
]);
export type DomainEventType = z.infer<typeof domainEventTypeSchema>;

const domainEventBaseSchema = z.object({
  eventId: uuidSchema,
  eventType: domainEventTypeSchema,
  eventVersion: z.literal(1),
  occurredAt: z.iso.datetime(),
  aggregateType: z.enum(["conversation", "message", "receipt"]),
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

export const p3DomainEventSchema = z.discriminatedUnion("eventType", [
  conversationCreatedEventSchema,
  conversationUpdatedEventSchema,
  messageCreatedEventSchema,
  receiptUpdatedEventSchema,
]);
export type P3DomainEvent = z.infer<typeof p3DomainEventSchema>;
