import type { Request } from "express";

import type { RequestMetadata } from "../auth.types.js";

export function requestMetadata(request: Request): RequestMetadata {
  return {
    ip: request.ip ?? request.socket.remoteAddress ?? null,
    userAgent: request.headers["user-agent"] ?? null,
  };
}
