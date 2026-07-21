import { Injectable } from "@nestjs/common";

@Injectable()
export class RedisKeyFactory {
  authRate(
    kind: "identity" | "ip" | "challenge" | "challenge-cooldown",
    valueHash: string,
  ): string {
    return `auth:rate:${kind}:${valueHash}`;
  }

  revokedSession(sessionId: string): string {
    return `session:revoked:${sessionId}`;
  }
}
