import { randomBytes, randomUUID } from "node:crypto";
import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

import { RequestContextService } from "./request-context.service.js";

const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;
const traceParentPattern = /^[\da-f]{2}-([\da-f]{32})-[\da-f]{16}-[\da-f]{2}$/i;

export function resolveRequestId(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && requestIdPattern.test(candidate) ? candidate : randomUUID();
}

export function resolveTraceId(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  const match = candidate?.match(traceParentPattern);
  return match?.[1]?.toLowerCase() ?? randomBytes(16).toString("hex");
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContextService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const correlatedRequest = request as Request & { id?: string; traceId?: string };
    const requestId = correlatedRequest.id ?? resolveRequestId(request.headers["x-request-id"]);
    const traceId = correlatedRequest.traceId ?? resolveTraceId(request.headers.traceparent);
    correlatedRequest.id = requestId;
    correlatedRequest.traceId = traceId;
    request.headers["x-request-id"] = requestId;
    response.setHeader("X-Request-Id", requestId);
    this.requestContext.run({ requestId, traceId }, next);
  }
}
