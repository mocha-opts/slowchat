import { z } from "zod";

import { messageSchema, messageReactionSchema, reactionSchema } from "../messages/index.js";
import { paginationQuerySchema, uuidSchema } from "./common.js";

export const addReactionRequestSchema = z.object({ reaction: reactionSchema }).strict();
export type AddReactionRequest = z.infer<typeof addReactionRequestSchema>;

export const reactionResponseSchema = messageReactionSchema;

export const forwardMessageRequestSchema = z
  .object({
    clientMessageId: uuidSchema,
    conversationId: uuidSchema,
  })
  .strict();
export type ForwardMessageRequest = z.infer<typeof forwardMessageRequestSchema>;

export const messageSearchQuerySchema = paginationQuerySchema
  .extend({
    q: z.string().trim().min(1).max(128),
  })
  .strict();
export type MessageSearchQuery = z.infer<typeof messageSearchQuerySchema>;

export const messageSearchResponseSchema = z.object({
  items: z.array(messageSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export type MessageSearchResponse = z.infer<typeof messageSearchResponseSchema>;
