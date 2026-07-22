import { z } from "zod";

import {
  deliveredMessageRequestSchema,
  readConversationRequestSchema,
} from "../api/conversations.js";
import { uuidSchema } from "../api/common.js";
import {
  messageAcceptedSchema,
  messageSchema,
  receiptSchema,
  sendTextMessageRequestSchema,
} from "../messages/index.js";

const wsCommandBase = {
  version: z.literal(1),
  requestId: z.string().min(1).max(128),
  deviceId: uuidSchema,
  timestamp: z.number().int().nonnegative(),
};

export const messageSendCommandSchema = z
  .object({
    ...wsCommandBase,
    event: z.literal("message.send"),
    data: sendTextMessageRequestSchema.safeExtend({ conversationId: uuidSchema }),
  })
  .strict();
export const messageDeliveredCommandSchema = z
  .object({
    ...wsCommandBase,
    event: z.literal("message.delivered"),
    data: deliveredMessageRequestSchema,
  })
  .strict();
export const conversationReadCommandSchema = z
  .object({
    ...wsCommandBase,
    event: z.literal("conversation.read"),
    data: readConversationRequestSchema.extend({ conversationId: uuidSchema }),
  })
  .strict();

export const p3WsCommandSchema = z.discriminatedUnion("event", [
  messageSendCommandSchema,
  messageDeliveredCommandSchema,
  conversationReadCommandSchema,
]);
export type P3WsCommand = z.infer<typeof p3WsCommandSchema>;

export interface WsCommand<T = unknown> {
  version: 1;
  event: string;
  requestId: string;
  deviceId: string;
  timestamp: number;
  data: T;
}

export const wsServerEventSchema = z.object({
  version: z.literal(1),
  event: z.string().min(1),
  eventId: uuidSchema,
  serverTimestamp: z.number().int().nonnegative(),
  traceId: z.string().optional(),
  data: z.unknown(),
});
export type WsServerEvent<T = unknown> = Omit<z.infer<typeof wsServerEventSchema>, "data"> & {
  data: T;
};

export const wsAckSchema = z.object({
  requestId: z.string().min(1),
  ok: z.boolean(),
  code: z.string().min(1),
  message: z.string().optional(),
  data: z.unknown().optional(),
  serverTimestamp: z.number().int().nonnegative(),
});
export type WsAck<T = unknown> = Omit<z.infer<typeof wsAckSchema>, "data"> & { data?: T };

export const messageAcceptedEventDataSchema = messageAcceptedSchema;
export const messageCreatedEventDataSchema = messageSchema;
export const receiptUpdatedEventDataSchema = receiptSchema;

export const sessionRevokedEventDataSchema = z.object({
  sessionId: uuidSchema,
  deviceId: uuidSchema,
  reason: z.string(),
});

export const userRealtimeEventNameSchema = z.enum([
  "session.revoked",
  "friend-request.updated",
  "contact.updated",
  "block.updated",
  "connection.ready",
  "message.accepted",
  "conversation.created",
  "conversation.updated",
  "message.created",
  "receipt.updated",
]);
