import { z } from "zod";

import { uuidSchema } from "../api/common.js";

export const imagePayloadSchema = z
  .object({
    attachmentId: uuidSchema,
    width: z.number().int().positive().safe().nullable().optional(),
    height: z.number().int().positive().safe().nullable().optional(),
    caption: z.string().max(4096).optional(),
  })
  .strict();
export type ImagePayload = z.infer<typeof imagePayloadSchema>;

export const filePayloadSchema = z
  .object({
    attachmentId: uuidSchema,
    fileName: z.string().min(1).max(255),
    contentType: z.string().min(1).max(127),
    sizeBytes: z.number().int().positive().safe(),
  })
  .strict();
export type FilePayload = z.infer<typeof filePayloadSchema>;

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
  .object({
    text: z.string().min(1),
    mentions: z.array(uuidSchema).max(100).optional(),
    mentionAll: z.boolean().optional(),
  })
  .strict()
  .refine((value) => utf8ByteLength(value.text) <= 8 * 1024, {
    message: "Text payload must not exceed 8 KiB",
    path: ["text"],
  });
export type TextPayload = z.infer<typeof textPayloadSchema>;

export const systemMessagePayloadSchema = z
  .object({
    kind: z.enum([
      "MEMBER_JOINED",
      "MEMBER_LEFT",
      "MEMBER_REMOVED",
      "GROUP_UPDATED",
      "OWNER_TRANSFERRED",
      "ADMIN_UPDATED",
      "MUTE_UPDATED",
      "GROUP_DISBANDED",
    ]),
    actorUserId: uuidSchema,
    targetUserId: uuidSchema.nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type SystemMessagePayload = z.infer<typeof systemMessagePayloadSchema>;

export const sendTextMessageRequestSchema = z
  .object({
    clientMessageId: uuidSchema,
    type: z.literal("TEXT"),
    contentVersion: z.literal(1),
    payload: textPayloadSchema,
    replyToMessageId: uuidSchema.optional(),
    forwardFromMessageId: uuidSchema.optional(),
  })
  .strict();
export type SendTextMessageRequest = z.infer<typeof sendTextMessageRequestSchema>;

export const sendMediaMessageRequestSchema = z.discriminatedUnion("type", [
  z.object({
    clientMessageId: uuidSchema,
    type: z.literal("IMAGE"),
    contentVersion: z.literal(1),
    payload: imagePayloadSchema,
    replyToMessageId: uuidSchema.optional(),
    forwardFromMessageId: uuidSchema.optional(),
  }),
  z.object({
    clientMessageId: uuidSchema,
    type: z.literal("FILE"),
    contentVersion: z.literal(1),
    payload: filePayloadSchema,
    replyToMessageId: uuidSchema.optional(),
    forwardFromMessageId: uuidSchema.optional(),
  }),
]);
export type SendMediaMessageRequest = z.infer<typeof sendMediaMessageRequestSchema>;
export const sendMessageRequestSchema = z.discriminatedUnion("type", [
  sendTextMessageRequestSchema,
  ...sendMediaMessageRequestSchema.options,
]);
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;

const messageBaseSchema = z.object({
  id: uuidSchema,
  conversationId: uuidSchema,
  seq: z.number().int().nonnegative().safe(),
  senderId: uuidSchema,
  senderDeviceId: uuidSchema,
  clientMessageId: uuidSchema,
  textPreview: z.string(),
  countsUnread: z.boolean(),
  replyToMessageId: uuidSchema.nullable().optional(),
  forwardFromMessageId: uuidSchema.nullable().optional(),
  editedAt: z.iso.datetime().nullable().optional(),
  recalledAt: z.iso.datetime().nullable().optional(),
  recalledBy: uuidSchema.nullable().optional(),
  createdAt: z.iso.datetime(),
});
export const textMessageSchema = messageBaseSchema.extend({
  type: z.literal("TEXT"),
  contentVersion: z.literal(1),
  payload: textPayloadSchema,
});
export const systemMessageSchema = messageBaseSchema.extend({
  type: z.literal("SYSTEM"),
  contentVersion: z.literal(1),
  payload: systemMessagePayloadSchema,
});
export const imageMessageSchema = messageBaseSchema.extend({
  type: z.literal("IMAGE"),
  contentVersion: z.literal(1),
  payload: imagePayloadSchema,
});
export const fileMessageSchema = messageBaseSchema.extend({
  type: z.literal("FILE"),
  contentVersion: z.literal(1),
  payload: filePayloadSchema,
});
export const messageSchema = z.discriminatedUnion("type", [
  textMessageSchema,
  imageMessageSchema,
  fileMessageSchema,
  systemMessageSchema,
]);
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

export const reactionSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(
    (value) =>
      [...value].every((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint >= 0x20 && codePoint !== 0x7f;
      }),
    "Reaction contains control characters",
  );
export type Reaction = z.infer<typeof reactionSchema>;

export const messageReactionSchema = z.object({
  id: uuidSchema,
  messageId: uuidSchema,
  userId: uuidSchema,
  reaction: reactionSchema,
  createdAt: z.iso.datetime(),
});
export type MessageReaction = z.infer<typeof messageReactionSchema>;

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return bytes;
}
