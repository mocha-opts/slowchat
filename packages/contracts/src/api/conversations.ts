import { z } from "zod";

import { messageAcceptedSchema, messageSchema, receiptSchema } from "../messages/index.js";
import { publicUserSchema, uuidSchema } from "./common.js";

export const conversationTypeSchema = z.enum(["DIRECT", "GROUP", "SYSTEM"]);

export const conversationSchema = z.object({
  id: uuidSchema,
  type: conversationTypeSchema,
  peer: publicUserSchema.nullable(),
  lastSeq: z.number().int().nonnegative().safe(),
  lastMessage: messageSchema.nullable(),
  unreadCount: z.number().int().nonnegative(),
  lastDeliveredSeq: z.number().int().nonnegative().safe(),
  lastReadSeq: z.number().int().nonnegative().safe(),
  pinned: z.boolean(),
  muted: z.boolean(),
  archived: z.boolean(),
  hidden: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Conversation = z.infer<typeof conversationSchema>;

export const createDirectConversationRequestSchema = z.object({ userId: uuidSchema }).strict();
export type CreateDirectConversationRequest = z.infer<typeof createDirectConversationRequestSchema>;

export const updateConversationSettingsRequestSchema = z
  .object({
    pinned: z.boolean().optional(),
    muted: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one setting is required");
export type UpdateConversationSettingsRequest = z.infer<
  typeof updateConversationSettingsRequestSchema
>;

export const conversationListQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const conversationListResponseSchema = z.object({
  items: z.array(conversationSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

export const readConversationRequestSchema = z
  .object({ lastReadSeq: z.number().int().nonnegative().safe() })
  .strict();
export const deliveredMessageRequestSchema = z
  .object({
    conversationId: uuidSchema,
    lastDeliveredSeq: z.number().int().nonnegative().safe(),
  })
  .strict();

export const messageHistoryQuerySchema = z.object({
  beforeSeq: z.coerce.number().int().positive().safe().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const messageHistoryResponseSchema = z.object({
  items: z.array(messageSchema),
  nextBeforeSeq: z.number().int().positive().safe().nullable(),
  hasMore: z.boolean(),
});

export { messageAcceptedSchema, messageSchema, receiptSchema };
