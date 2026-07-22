import { z } from "zod";

import { messageSchema } from "../messages/index.js";
import { uuidSchema } from "./common.js";
import { conversationSchema } from "./conversations.js";

export const syncEventTypeSchema = z.enum([
  "conversation.created.v1",
  "conversation.updated.v1",
  "message.created.v1",
  "receipt.updated.v1",
]);
export type SyncEventType = z.infer<typeof syncEventTypeSchema>;

export const syncEventSchema = z.object({
  id: z.number().int().positive().safe(),
  eventId: uuidSchema,
  userId: uuidSchema,
  eventType: syncEventTypeSchema,
  eventVersion: z.literal(1),
  entityType: z.string().min(1).max(50).nullable(),
  entityId: uuidSchema.nullable(),
  conversationId: uuidSchema.nullable(),
  seq: z.number().int().nonnegative().safe().nullable(),
  payload: z.unknown(),
  createdAt: z.iso.datetime(),
});
export type SyncEvent = z.infer<typeof syncEventSchema>;

export const messageRangeSchema = z.object({
  conversationId: uuidSchema,
  afterSeq: z.number().int().nonnegative().safe().nullable(),
  beforeSeq: z.number().int().nonnegative().safe().nullable(),
  messages: z.array(messageSchema),
  hasMore: z.boolean(),
});
export type MessageRange = z.infer<typeof messageRangeSchema>;

export const syncRequestSchema = z
  .object({
    deviceId: uuidSchema,
    userSyncCursor: z.number().int().nonnegative().safe().default(0),
    lastSeq: z.record(uuidSchema, z.number().int().nonnegative().safe()).default({}),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .strict();
export type SyncRequest = z.infer<typeof syncRequestSchema>;

export const syncEventsQuerySchema = z.object({
  deviceId: uuidSchema,
  after: z.coerce.number().int().nonnegative().safe().default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type SyncEventsQuery = z.infer<typeof syncEventsQuerySchema>;

export const snapshotSchema = z.object({
  user: z.unknown(),
  device: z.unknown(),
  contacts: z.array(z.unknown()),
  blocks: z.array(z.unknown()),
  conversations: z.array(conversationSchema),
  userSyncCursor: z.number().int().nonnegative().safe(),
  serverTimestamp: z.number().int().positive().safe(),
});
export type SyncSnapshot = z.infer<typeof snapshotSchema>;

export const syncResponseSchema = z.object({
  userSyncCursor: z.number().int().nonnegative().safe(),
  hasMore: z.boolean(),
  events: z.array(syncEventSchema),
  missingRanges: z.array(messageRangeSchema),
  serverTimestamp: z.number().int().positive().safe(),
});
export type SyncResponse = z.infer<typeof syncResponseSchema>;

export const messageRangeQuerySchema = z.object({
  afterSeq: z.coerce.number().int().nonnegative().safe().optional(),
  beforeSeq: z.coerce.number().int().nonnegative().safe().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type MessageRangeQuery = z.infer<typeof messageRangeQuerySchema>;
