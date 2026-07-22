import { z } from "zod";

import { paginationQuerySchema, publicUserSchema, uuidSchema } from "./common.js";

export const groupRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER"]);
export type GroupRole = z.infer<typeof groupRoleSchema>;
export const groupMemberStatusSchema = z.enum(["ACTIVE", "LEFT", "REMOVED"]);
export const groupJoinModeSchema = z.enum(["INVITE_ONLY", "REQUEST", "OPEN"]);
export type GroupJoinMode = z.infer<typeof groupJoinModeSchema>;
export const groupJoinRequestStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
]);
export const groupInviteStatusSchema = z.enum(["PENDING", "ACCEPTED", "REJECTED", "CANCELLED"]);

export const groupProfileSchema = z.object({
  conversationId: uuidSchema,
  title: z.string().min(1).max(128),
  announcement: z.string().max(2000).nullable(),
  maxMembers: z.number().int().min(2).max(2000),
  joinMode: groupJoinModeSchema,
  allowMemberInvites: z.boolean(),
  allMembersMuted: z.boolean(),
  version: z.number().int().positive(),
});
export type GroupProfile = z.infer<typeof groupProfileSchema>;

export const groupMemberSchema = z.object({
  user: publicUserSchema,
  role: groupRoleSchema,
  status: groupMemberStatusSchema,
  nickname: z.string().nullable(),
  joinedSeq: z.number().int().nonnegative().safe(),
  joinedAt: z.iso.datetime(),
  muteUntil: z.iso.datetime().nullable(),
});
export type GroupMember = z.infer<typeof groupMemberSchema>;

export const createGroupRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(128),
    announcement: z.string().trim().max(2000).optional(),
    maxMembers: z.number().int().min(2).max(2000).default(500),
    joinMode: groupJoinModeSchema.default("INVITE_ONLY"),
    allowMemberInvites: z.boolean().default(false),
  })
  .strict();
export type CreateGroupRequest = z.infer<typeof createGroupRequestSchema>;

export const updateGroupRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(128).optional(),
    announcement: z.string().trim().max(2000).nullable().optional(),
    maxMembers: z.number().int().min(2).max(2000).optional(),
    joinMode: groupJoinModeSchema.optional(),
    allowMemberInvites: z.boolean().optional(),
    allMembersMuted: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one group setting is required");
export type UpdateGroupRequest = z.infer<typeof updateGroupRequestSchema>;

export const groupMemberListQuerySchema = paginationQuerySchema;
export const groupMembersResponseSchema = z.object({
  items: z.array(groupMemberSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export type GroupMembersResponse = z.infer<typeof groupMembersResponseSchema>;

export const addGroupMemberRequestSchema = z.object({ userId: uuidSchema }).strict();
export type AddGroupMemberRequest = z.infer<typeof addGroupMemberRequestSchema>;
export const updateGroupMemberRequestSchema = z
  .object({
    role: groupRoleSchema.exclude(["OWNER"]).optional(),
    muteUntil: z.iso.datetime().nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one member setting is required");
export type UpdateGroupMemberRequest = z.infer<typeof updateGroupMemberRequestSchema>;
export const transferGroupOwnerRequestSchema = z.object({ userId: uuidSchema }).strict();
export type TransferGroupOwnerRequest = z.infer<typeof transferGroupOwnerRequestSchema>;

export const groupJoinRequestSchema = z.object({
  id: uuidSchema,
  conversationId: uuidSchema,
  user: publicUserSchema,
  status: groupJoinRequestStatusSchema,
  message: z.string().nullable(),
  reviewerId: uuidSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type GroupJoinRequest = z.infer<typeof groupJoinRequestSchema>;
export const createGroupJoinRequestSchema = z
  .object({ message: z.string().trim().max(200).optional() })
  .strict();
export type CreateGroupJoinRequest = z.infer<typeof createGroupJoinRequestSchema>;
export const groupJoinRequestListQuerySchema = paginationQuerySchema.extend({
  status: groupJoinRequestStatusSchema.optional(),
});
export type GroupJoinRequestListQuery = z.infer<typeof groupJoinRequestListQuerySchema>;

export const groupInviteSchema = z.object({
  id: uuidSchema,
  conversationId: uuidSchema,
  inviterId: uuidSchema,
  inviteeId: uuidSchema,
  status: groupInviteStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type GroupInvite = z.infer<typeof groupInviteSchema>;
export const createGroupInviteRequestSchema = z.object({ userId: uuidSchema }).strict();
export type CreateGroupInviteRequest = z.infer<typeof createGroupInviteRequestSchema>;
export const groupInviteDecisionSchema = z
  .object({ decision: z.enum(["ACCEPTED", "REJECTED"]) })
  .strict();
export type GroupInviteDecision = z.infer<typeof groupInviteDecisionSchema>;
