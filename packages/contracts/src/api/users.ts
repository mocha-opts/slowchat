import { z } from "zod";

import { currentUserSchema, paginationQuerySchema, publicUserSchema } from "./common.js";
import { passwordSchema } from "./auth.js";

export const updateCurrentUserRequestSchema = z
  .object({
    username: z
      .string()
      .regex(/^[a-z0-9_.]{3,32}$/)
      .optional(),
    nickname: z.string().trim().min(1).max(64).optional(),
    avatarUrl: z.url().max(2048).nullable().optional(),
    signature: z.string().max(280).nullable().optional(),
    region: z.string().max(64).nullable().optional(),
    extensions: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((value) => JSON.stringify(value.extensions ?? {}).length <= 8192, {
    message: "extensions must not exceed 8 KiB",
  });
export type UpdateCurrentUserRequest = z.infer<typeof updateCurrentUserRequestSchema>;

export const deleteCurrentUserRequestSchema = z.object({ password: passwordSchema });
export type DeleteCurrentUserRequest = z.infer<typeof deleteCurrentUserRequestSchema>;
export const userSearchQuerySchema = paginationQuerySchema.extend({
  query: z.string().trim().min(2).max(50),
});
export const userSearchResponseSchema = z.object({
  items: z.array(publicUserSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

export const privacyAudienceSchema = z.enum(["EVERYONE", "CONTACTS", "NOBODY"]);
export const privacySettingsSchema = z.object({
  searchAudience: privacyAudienceSchema,
  friendRequestAudience: privacyAudienceSchema,
  groupInviteAudience: privacyAudienceSchema,
  onlineStatusAudience: privacyAudienceSchema,
  lastSeenAudience: privacyAudienceSchema,
  allowStrangerMessages: z.boolean(),
  allowBotDirectMessages: z.boolean(),
});
export type PrivacySettings = z.infer<typeof privacySettingsSchema>;
export const updatePrivacySettingsRequestSchema = privacySettingsSchema.partial();
export type UpdatePrivacySettingsRequest = z.infer<typeof updatePrivacySettingsRequestSchema>;
export const currentUserResponseSchema = currentUserSchema;
