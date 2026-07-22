import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeProtectedHeader, decodeJwt } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { IdentityNormalizerService } from "../../src/modules/auth/services/identity-normalizer.service.js";
import { PasswordService } from "../../src/modules/auth/services/password.service.js";
import { TokenService } from "../../src/modules/auth/services/token.service.js";
import type { AppConfig } from "../../src/platform/config/app-config.js";

describe("P2 authentication security primitives", () => {
  let directory: string;
  let tokens: TokenService;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "slowchat-auth-"));
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const privatePath = join(directory, "private.pem");
    const publicPath = join(directory, "public.pem");
    await Promise.all([writeFile(privatePath, privateKey), writeFile(publicPath, publicKey)]);
    tokens = new TokenService(config(privatePath, publicPath));
    await tokens.onModuleInit();
  });

  afterAll(async () => rm(directory, { recursive: true, force: true }));

  it("normalizes email and E.164 phone identities", () => {
    const service = new IdentityNormalizerService();
    expect(service.normalize({ type: "EMAIL", value: " Alice@Example.COM " })).toEqual({
      type: "EMAIL",
      value: "alice@example.com",
    });
    expect(service.normalize({ type: "PHONE", value: "+8613800138000" })).toEqual({
      type: "PHONE",
      value: "+8613800138000",
    });
    expect(() => service.normalize({ type: "PHONE", value: "13800138000" })).toThrow();
  });

  it("hashes passwords with Argon2id and enforces the configured policy", async () => {
    const service = new PasswordService();
    const encoded = await service.hash("correct-horse-battery-staple");
    expect(encoded).toContain("$argon2id$");
    await expect(service.verify(encoded, "correct-horse-battery-staple")).resolves.toBe(true);
    await expect(service.verify(encoded, "incorrect-password")).resolves.toBe(false);
    expect(() => service.assertPolicy("too-short")).toThrow();
  });

  it("issues RS256 access tokens with the required claims and opaque refresh secrets", async () => {
    const context = {
      userId: "019b0000-0000-7000-8000-000000000001",
      sessionId: "019b0000-0000-7000-8000-000000000002",
      deviceId: "019b0000-0000-7000-8000-000000000003",
    };
    const accessToken = await tokens.signAccessToken(context);
    expect(decodeProtectedHeader(accessToken)).toMatchObject({ alg: "RS256", kid: "test-key" });
    expect(decodeJwt(accessToken)).toMatchObject({
      sub: context.userId,
      sessionId: context.sessionId,
      deviceId: context.deviceId,
      iss: "slowchat-test",
      aud: "slowchat-test-clients",
    });
    await expect(tokens.verifyAccessToken(accessToken)).resolves.toEqual(context);

    const refresh = tokens.createRefreshToken();
    expect(refresh.token).toMatch(/^[^.]+\.[A-Za-z0-9_-]+$/);
    expect(refresh.hash).not.toContain(refresh.secret);
    expect(tokens.parseRefreshToken(refresh.token)).toEqual({ id: refresh.id, hash: refresh.hash });
  });
});

function config(privatePath: string, publicPath: string): AppConfig {
  return {
    nodeEnv: "test",
    serviceName: "api",
    logLevel: "silent",
    shutdownGraceMs: 15_000,
    ports: { api: 3000, realtime: 3001, "event-worker": 3002, "job-worker": 3003 },
    databaseUrl: "postgresql://unused",
    redis: {
      realtimeUrl: "redis://unused",
      realtimePrefix: "im:realtime:",
      jobsUrl: "redis://unused",
      jobsPrefix: "im:jobs:",
    },
    rabbitMqUrl: "amqp://unused",
    messaging: {
      outboxPollIntervalMs: 250,
      outboxBatchSize: 100,
      outboxLockMs: 30_000,
      outboxMaxAttempts: 20,
      outboxRetryBaseMs: 500,
      outboxRetryMaxMs: 60_000,
      rabbitMqPrefetch: 50,
      rabbitMqRetryDelaysMs: [5_000, 30_000, 300_000],
      consumerLeaseMs: 30_000,
    },
    auth: {
      jwtIssuer: "slowchat-test",
      jwtAudience: "slowchat-test-clients",
      jwtKeyId: "test-key",
      jwtPrivateKeyPath: privatePath,
      jwtPublicKeyPath: publicPath,
      refreshTokenPepper: "test-refresh-token-pepper-32-bytes-minimum",
      challengePepper: "test-challenge-pepper-32-bytes-minimum-value",
      identifierPepper: "test-identifier-pepper-32-bytes-minimum",
      maxDevices: 5,
      challengeTtlSeconds: 600,
      challengeMaxAttempts: 5,
      challengeResendSeconds: 60,
      loginIdentityLimit: 5,
      loginIpLimit: 20,
      loginWindowSeconds: 900,
      exposeChallengeCode: true,
      allowedWsOrigins: ["http://localhost:3000"],
      recallWindowSeconds: 120,
    },
    s3: {
      endpoint: "http://unused",
      region: "us-east-1",
      accessKey: "unused",
      secretKey: "unused-secret",
      bucket: "im-test",
      forcePathStyle: true,
      autoCreateBucket: false,
    },
    media: {
      scannerMode: "deterministic",
      uploadTtlSeconds: 3600,
      maxImageBytes: 20 * 1024 * 1024,
      maxFileBytes: 1024 * 1024 * 1024,
    },
  };
}
