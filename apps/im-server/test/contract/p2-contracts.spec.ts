import {
  createFriendRequestSchema,
  createReportRequestSchema,
  loginRequestSchema,
  passwordChangeRequestSchema,
  registerRequestSchema,
  tokenResponseSchema,
  updateCurrentUserRequestSchema,
} from "@im/contracts/api";
import { apiErrorEnvelopeSchema } from "@im/contracts/errors";
import { sessionRevokedEventDataSchema, wsServerEventSchema } from "@im/contracts/websocket";
import { describe, expect, it } from "vitest";

const device = {
  clientDeviceId: "browser-stable-id",
  platform: "WEB",
  name: "Browser",
  appVersion: "1.0.0",
} as const;

describe("P2 public contracts", () => {
  it("accepts valid authentication commands and rejects malformed identities", () => {
    expect(
      registerRequestSchema.safeParse({
        challengeId: "019b0000-0000-7000-8000-000000000001",
        code: "123456",
        username: "alice.dev",
        password: "a-secure-password",
        device,
      }).success,
    ).toBe(true);
    expect(
      loginRequestSchema.safeParse({
        identity: { type: "EMAIL", value: "Alice@Example.com" },
        password: "a-secure-password",
        device,
      }).success,
    ).toBe(true);
    expect(
      loginRequestSchema.safeParse({
        identity: { type: "PHONE", value: "not-e164" },
        password: "a-secure-password",
        device,
      }).success,
    ).toBe(false);
    expect(
      passwordChangeRequestSchema.parse({
        currentPassword: "old-password",
        newPassword: "new-secure-password",
      }).revokeOtherSessions,
    ).toBe(true);
  });

  it("enforces user and contact payload bounds", () => {
    expect(updateCurrentUserRequestSchema.safeParse({ signature: "x".repeat(281) }).success).toBe(
      false,
    );
    expect(createFriendRequestSchema.safeParse({ userId: "invalid" }).success).toBe(false);
    expect(
      createReportRequestSchema.safeParse({
        userId: "019b0000-0000-7000-8000-000000000002",
        category: "SPAM",
        description: "Unsolicited messages",
      }).success,
    ).toBe(true);
  });

  it("keeps token, error, and WebSocket envelopes versioned and machine-readable", () => {
    expect(tokenResponseSchema.safeParse({ tokenType: "Basic" }).success).toBe(false);
    expect(
      apiErrorEnvelopeSchema.safeParse({
        requestId: "request-1",
        code: "AUTH_REFRESH_REUSED",
        message: "Refresh token was reused",
        details: {},
        timestamp: Date.now(),
      }).success,
    ).toBe(true);
    const data = {
      sessionId: "019b0000-0000-7000-8000-000000000003",
      deviceId: "019b0000-0000-7000-8000-000000000004",
      reason: "LOGOUT",
    };
    expect(sessionRevokedEventDataSchema.safeParse(data).success).toBe(true);
    expect(
      wsServerEventSchema.safeParse({
        version: 1,
        event: "session.revoked",
        eventId: "019b0000-0000-7000-8000-000000000005",
        serverTimestamp: Date.now(),
        data,
      }).success,
    ).toBe(true);
  });
});
