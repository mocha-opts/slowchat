import { z } from "zod";

import {
  currentUserSchema,
  deviceInputSchema,
  deviceSchema,
  sessionSchema,
  uuidSchema,
} from "./common.js";

export const identitySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("EMAIL"), value: z.email().max(254) }),
  z.object({ type: z.literal("PHONE"), value: z.string().regex(/^\+[1-9]\d{7,14}$/) }),
]);
export type Identity = z.infer<typeof identitySchema>;

export const passwordSchema = z.string().min(12).max(128);
export const verificationCodeSchema = z.string().regex(/^\d{6}$/);

export const registrationChallengeRequestSchema = z.object({ identity: identitySchema });
export type RegistrationChallengeRequest = z.infer<typeof registrationChallengeRequestSchema>;
export const passwordResetChallengeRequestSchema = z.object({ identity: identitySchema });
export type PasswordResetChallengeRequest = z.infer<typeof passwordResetChallengeRequestSchema>;
export const challengeResponseSchema = z.object({
  challengeId: uuidSchema,
  expiresAt: z.iso.datetime(),
  retryAfterSeconds: z.number().int().nonnegative(),
  debugCode: verificationCodeSchema.optional(),
});

export const registerRequestSchema = z.object({
  challengeId: uuidSchema,
  code: verificationCodeSchema,
  username: z.string().regex(/^[a-z0-9_.]{3,32}$/),
  password: passwordSchema,
  device: deviceInputSchema,
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  identity: identitySchema,
  password: z.string().min(1).max(128),
  device: deviceInputSchema,
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const refreshRequestSchema = z.object({ refreshToken: z.string().min(40).max(256) });
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;
export const logoutRequestSchema = refreshRequestSchema;
export type LogoutRequest = z.infer<typeof logoutRequestSchema>;
export const passwordChangeRequestSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
  revokeOtherSessions: z.boolean().default(true),
});
export type PasswordChangeRequest = z.infer<typeof passwordChangeRequestSchema>;
export const passwordResetConfirmRequestSchema = z.object({
  challengeId: uuidSchema,
  code: verificationCodeSchema,
  newPassword: passwordSchema,
});
export type PasswordResetConfirmRequest = z.infer<typeof passwordResetConfirmRequestSchema>;

export const tokenResponseSchema = z.object({
  tokenType: z.literal("Bearer"),
  accessToken: z.string(),
  expiresIn: z.literal(900),
  refreshToken: z.string(),
  refreshExpiresIn: z.literal(2_592_000),
  user: currentUserSchema,
  device: deviceSchema,
  session: sessionSchema,
});
export type TokenResponse = z.infer<typeof tokenResponseSchema>;

export const acceptedResponseSchema = z.object({ accepted: z.literal(true) });
export const sessionsResponseSchema = z.object({ items: z.array(sessionSchema) });
