import type { z } from "zod";

import { AppError } from "../errors/app-error.js";

export function parseContract<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new AppError("VALIDATION_ERROR", "Request validation failed", 400, {
    issues: result.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })),
  });
}
