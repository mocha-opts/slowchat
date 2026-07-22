import type { Request } from "express";

export function requestTrace(request: Request): { requestId?: string; traceId?: string } {
  const correlated = request as Request & { id?: string; traceId?: string };
  return {
    ...(correlated.id ? { requestId: correlated.id } : {}),
    ...(correlated.traceId ? { traceId: correlated.traceId } : {}),
  };
}
