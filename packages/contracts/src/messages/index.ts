import { z } from "zod";

import { uuidSchema } from "../api/common.js";

export const messageTypeSchema = z.enum([
  "TEXT",
  "IMAGE",
  "FILE",
  "AUDIO",
  "VIDEO",
  "LOCATION",
  "CONTACT",
  "RICH_CARD",
  "CUSTOM",
  "SYSTEM",
]);
export type MessageType = z.infer<typeof messageTypeSchema>;

export const textPayloadSchema = z
  .object({ text: z.string().min(1) })
  .strict()
  .refine((value) => utf8ByteLength(value.text) <= 8 * 1024, {
    message: "Text payload must not exceed 8 KiB",
    path: ["text"],
  });
export type TextPayload = z.infer<typeof textPayloadSchema>;

export const sendTextMessageRequestSchema = z
  .object({
    clientMessageId: uuidSchema,
    type: z.literal("TEXT"),
    contentVersion: z.literal(1),
    payload: textPayloadSchema,
  })
  .strict();
export type SendTextMessageRequest = z.infer<typeof sendTextMessageRequestSchema>;

export const messageSchema = z.object({
  id: uuidSchema,
  conversationId: uuidSchema,
  seq: z.number().int().nonnegative().safe(),
  senderId: uuidSchema,
  senderDeviceId: uuidSchema,
  clientMessageId: uuidSchema,
  type: z.literal("TEXT"),
  contentVersion: z.literal(1),
  payload: textPayloadSchema,
  textPreview: z.string(),
  countsUnread: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type Message = z.infer<typeof messageSchema>;

export const messageAcceptedSchema = z.object({
  status: z.literal("ACCEPTED"),
  messageId: uuidSchema,
  conversationId: uuidSchema,
  seq: z.number().int().nonnegative().safe(),
  duplicate: z.boolean(),
  serverTimestamp: z.number().int().nonnegative(),
});
export type MessageAccepted = z.infer<typeof messageAcceptedSchema>;

export const receiptSchema = z.object({
  conversationId: uuidSchema,
  userId: uuidSchema,
  lastDeliveredSeq: z.number().int().nonnegative().safe(),
  lastReadSeq: z.number().int().nonnegative().safe(),
  updatedAt: z.iso.datetime(),
});
export type Receipt = z.infer<typeof receiptSchema>;

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return bytes;
}
