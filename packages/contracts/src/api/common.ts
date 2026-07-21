import { z } from "zod";

export const uuidSchema = z.uuid();
export const opaqueCursorSchema = z.string().min(1).max(512);
export const paginationQuerySchema = z.object({
  cursor: opaqueCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const devicePlatformSchema = z.enum(["WEB", "DESKTOP", "IOS", "ANDROID", "OTHER"]);
export type DevicePlatform = z.infer<typeof devicePlatformSchema>;

export const deviceInputSchema = z.object({
  clientDeviceId: z.string().min(8).max(128),
  platform: devicePlatformSchema,
  name: z.string().trim().min(1).max(100),
  appVersion: z.string().trim().min(1).max(50).optional(),
});
export type DeviceInput = z.infer<typeof deviceInputSchema>;

export const deviceSchema = z.object({
  id: uuidSchema,
  clientDeviceId: z.string(),
  platform: devicePlatformSchema,
  name: z.string(),
  appVersion: z.string().nullable(),
  status: z.enum(["ACTIVE", "REVOKED"]),
  lastSeenAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type Device = z.infer<typeof deviceSchema>;
export const devicesResponseSchema = z.object({ items: z.array(deviceSchema) });

export const sessionSchema = z.object({
  id: uuidSchema,
  deviceId: uuidSchema,
  status: z.enum(["ACTIVE", "REVOKED"]),
  lastUsedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type Session = z.infer<typeof sessionSchema>;

export const userStatusSchema = z.enum(["ACTIVE", "FROZEN", "DISABLED", "DELETED"]);
export const userTypeSchema = z.enum(["USER", "BOT", "SYSTEM"]);
export const currentUserSchema = z.object({
  id: uuidSchema,
  username: z.string(),
  nickname: z.string(),
  avatarUrl: z.string().nullable(),
  signature: z.string().nullable(),
  region: z.string().nullable(),
  status: userStatusSchema,
  type: userTypeSchema,
  extensions: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

export const publicUserSchema = currentUserSchema.pick({
  id: true,
  username: true,
  nickname: true,
  avatarUrl: true,
  signature: true,
  region: true,
  type: true,
});
export type PublicUser = z.infer<typeof publicUserSchema>;
