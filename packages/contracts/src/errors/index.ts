import { z } from "zod";

export const errorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const apiErrorEnvelopeSchema = z.object({
  requestId: z.string().min(1),
  code: errorCodeSchema,
  message: z.string(),
  details: z.record(z.string(), z.unknown()),
  timestamp: z.number().int().nonnegative(),
});

export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>;
