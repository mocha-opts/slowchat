import { z } from "zod";

import { uuidSchema } from "../api/common.js";

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
]);
