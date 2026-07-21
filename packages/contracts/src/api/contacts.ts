import { z } from "zod";

import { paginationQuerySchema, publicUserSchema, uuidSchema } from "./common.js";

export const createFriendRequestSchema = z.object({
  userId: uuidSchema,
  message: z.string().trim().max(200).optional(),
});
export type CreateFriendRequest = z.infer<typeof createFriendRequestSchema>;
export const friendRequestSchema = z.object({
  id: uuidSchema,
  requesterId: uuidSchema,
  recipientId: uuidSchema,
  status: z.enum(["PENDING", "ACCEPTED", "REJECTED", "CANCELLED"]),
  message: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const friendRequestsQuerySchema = paginationQuerySchema.extend({
  direction: z.enum(["INCOMING", "OUTGOING"]).default("INCOMING"),
});
export const friendRequestsResponseSchema = z.object({
  items: z.array(friendRequestSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

export const contactSchema = z.object({
  user: publicUserSchema,
  remark: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export const contactsResponseSchema = z.object({
  items: z.array(contactSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export const updateContactRequestSchema = z.object({
  remark: z.string().trim().max(100).nullable(),
});
export type UpdateContactRequest = z.infer<typeof updateContactRequestSchema>;

export const blockSchema = z.object({
  user: publicUserSchema,
  createdAt: z.iso.datetime(),
});
export const blocksResponseSchema = z.object({
  items: z.array(blockSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

export const createReportRequestSchema = z.object({
  userId: uuidSchema,
  category: z.enum(["SPAM", "HARASSMENT", "IMPERSONATION", "OTHER"]),
  description: z.string().trim().min(1).max(1000),
});
export type CreateReportRequest = z.infer<typeof createReportRequestSchema>;
