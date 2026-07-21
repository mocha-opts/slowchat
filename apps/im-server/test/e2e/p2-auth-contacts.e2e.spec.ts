import "reflect-metadata";

import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Test } from "@nestjs/testing";
import { GenericContainer, Wait, type StartedTestContainer } from "@im/test-utils";
import {
  challengeResponseSchema,
  contactsResponseSchema,
  devicesResponseSchema,
  friendRequestSchema,
  tokenResponseSchema,
  type TokenResponse,
} from "@im/contracts/api";
import { apiErrorEnvelopeSchema } from "@im/contracts/errors";
import request from "supertest";
import { DataSource } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ApiAppModule } from "../../src/compositions/api-app.module.js";
import { RequestContextMiddleware } from "../../src/platform/request-context/request-context.middleware.js";
import { CreateAuthUsersContacts1784563200000 } from "../../src/platform/database/migrations/202607210001-create-auth-users-contacts.js";
import type { INestApplication } from "@nestjs/common";

describe("P2 authentication and contacts E2E", () => {
  let postgres: StartedTestContainer;
  let redis: StartedTestContainer;
  let minio: StartedTestContainer;
  let keyDirectory: string;
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    [postgres, redis, minio] = await Promise.all([
      new GenericContainer("postgres:18.3-alpine")
        .withEnvironment({ POSTGRES_DB: "im", POSTGRES_USER: "im", POSTGRES_PASSWORD: "secret" })
        .withExposedPorts(5432)
        .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
        .start(),
      new GenericContainer("redis:8.6-alpine").withExposedPorts(6379).start(),
      new GenericContainer("quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z")
        .withCommand(["server", "/data"])
        .withEnvironment({ MINIO_ROOT_USER: "im_minio", MINIO_ROOT_PASSWORD: "minio_secret" })
        .withExposedPorts(9000)
        .withWaitStrategy(Wait.forHttp("/minio/health/live", 9000))
        .start(),
    ]);
    keyDirectory = await createKeys();
    Object.assign(process.env, {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      DATABASE_URL: `postgresql://im:secret@${postgres.getHost()}:${postgres.getMappedPort(5432)}/im`,
      REDIS_REALTIME_URL: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}/0`,
      REDIS_REALTIME_PREFIX: "im:e2e:realtime:",
      REDIS_JOBS_URL: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}/1`,
      REDIS_JOBS_PREFIX: "im:e2e:jobs:",
      RABBITMQ_URL: "amqp://unused:unused@127.0.0.1:5672/im",
      S3_ENDPOINT: `http://${minio.getHost()}:${minio.getMappedPort(9000)}`,
      S3_REGION: "us-east-1",
      S3_ACCESS_KEY: "im_minio",
      S3_SECRET_KEY: "minio_secret",
      S3_BUCKET: "im-e2e",
      S3_FORCE_PATH_STYLE: "true",
      S3_AUTO_CREATE_BUCKET: "true",
      JWT_ISSUER: "slowchat-e2e",
      JWT_AUDIENCE: "slowchat-e2e-clients",
      JWT_KEY_ID: "e2e-rs256",
      JWT_PRIVATE_KEY_PATH: join(keyDirectory, "private.pem"),
      JWT_PUBLIC_KEY_PATH: join(keyDirectory, "public.pem"),
      AUTH_REFRESH_TOKEN_PEPPER: "e2e-refresh-token-pepper-at-least-32-bytes",
      AUTH_CHALLENGE_PEPPER: "e2e-challenge-pepper-at-least-32-bytes-value",
      AUTH_IDENTIFIER_PEPPER: "e2e-identifier-pepper-at-least-32-bytes",
      AUTH_MAX_DEVICES: "5",
      AUTH_EXPOSE_CHALLENGE_CODE: "true",
      AUTH_ALLOWED_WS_ORIGINS: "http://localhost:3000",
    });

    const module = await Test.createTestingModule({ imports: [ApiAppModule] }).compile();
    app = module.createNestApplication();
    const requestContext = app.get(RequestContextMiddleware);
    app.use(requestContext.use.bind(requestContext));
    await app.init();
    dataSource = app.get(DataSource);
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await new CreateAuthUsersContacts1784563200000().up(queryRunner);
    await queryRunner.release();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      await new CreateAuthUsersContacts1784563200000().down(queryRunner).catch(() => undefined);
      await queryRunner.release();
    }
    if (app) await app.close();
    await Promise.all(
      [postgres, redis, minio]
        .filter((container): container is StartedTestContainer => Boolean(container))
        .map((container) => container.stop()),
    );
    if (keyDirectory) await rm(keyDirectory, { recursive: true, force: true });
  });

  it("registers two verified users, rotates refresh tokens, and completes the contact lifecycle", async () => {
    const alice = await register("alice@example.com", "alice", "alice-browser");
    const bob = await register("bob@example.com", "bob", "bob-browser");
    const charlie = await registerPhone("+8613800138000", "charlie", "charlie-mobile");
    expect(charlie.user.username).toBe("charlie");

    const loginResponse = await request(httpServer())
      .post("/api/v1/auth/login")
      .send({
        identity: { type: "EMAIL", value: "ALICE@example.com" },
        password: "alice-secure-password",
        device: device("alice-browser"),
      })
      .expect(200);
    const login = tokenResponseSchema.parse(loginResponse.body);
    expect(login.user.id).toBe(alice.user.id);

    const desktopLoginResponse = await request(httpServer())
      .post("/api/v1/auth/login")
      .send({
        identity: { type: "EMAIL", value: "alice@example.com" },
        password: "alice-secure-password",
        device: device("alice-desktop"),
      })
      .expect(200);
    const desktopLogin = tokenResponseSchema.parse(desktopLoginResponse.body);
    const devicesResponse = await request(httpServer())
      .get("/api/v1/devices")
      .set("Authorization", `Bearer ${login.accessToken}`)
      .expect(200);
    expect(devicesResponseSchema.parse(devicesResponse.body).items).toHaveLength(2);
    await request(httpServer())
      .delete(`/api/v1/devices/${desktopLogin.device.id}`)
      .set("Authorization", `Bearer ${login.accessToken}`)
      .expect(204);
    await request(httpServer())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: desktopLogin.refreshToken })
      .expect(401);

    await request(httpServer())
      .post("/api/v1/auth/password/change")
      .set("Authorization", `Bearer ${login.accessToken}`)
      .send({
        currentPassword: "alice-secure-password",
        newPassword: "alice-new-secure-password",
        revokeOtherSessions: false,
      })
      .expect(204);
    await request(httpServer())
      .post("/api/v1/auth/login")
      .send({
        identity: { type: "EMAIL", value: "alice@example.com" },
        password: "alice-secure-password",
        device: device("alice-check"),
      })
      .expect(401);

    const friendRequestResponse = await request(httpServer())
      .post("/api/v1/friend-requests")
      .set("Authorization", `Bearer ${login.accessToken}`)
      .set("Idempotency-Key", "friend-alice-bob")
      .send({ userId: bob.user.id, message: "Hello" })
      .expect(201);
    const friendRequest = friendRequestSchema.parse(friendRequestResponse.body);
    expect(friendRequest.status).toBe("PENDING");

    await request(httpServer())
      .post(`/api/v1/friend-requests/${friendRequest.id}/accept`)
      .set("Authorization", `Bearer ${bob.accessToken}`)
      .expect(201);

    const contactsResponse = await request(httpServer())
      .get("/api/v1/contacts")
      .set("Authorization", `Bearer ${login.accessToken}`)
      .expect(200);
    const contacts = contactsResponseSchema.parse(contactsResponse.body);
    expect(contacts.items).toHaveLength(1);
    expect(contacts.items[0]?.user.id).toBe(bob.user.id);

    await request(httpServer())
      .patch("/api/v1/privacy-settings")
      .set("Authorization", `Bearer ${login.accessToken}`)
      .send({ friendRequestAudience: "NOBODY" })
      .expect(200);
    await request(httpServer())
      .post(`/api/v1/blocks/${bob.user.id}`)
      .set("Authorization", `Bearer ${login.accessToken}`)
      .expect(204);
    const contactsAfterBlock = await request(httpServer())
      .get("/api/v1/contacts")
      .set("Authorization", `Bearer ${login.accessToken}`)
      .expect(200);
    expect(contactsResponseSchema.parse(contactsAfterBlock.body).items).toHaveLength(0);
    const blockedRequest = await request(httpServer())
      .post("/api/v1/friend-requests")
      .set("Authorization", `Bearer ${bob.accessToken}`)
      .send({ userId: alice.user.id })
      .expect(403);
    expect(apiErrorEnvelopeSchema.parse(blockedRequest.body).code).toBe("USER_BLOCKED");
    await request(httpServer())
      .delete(`/api/v1/blocks/${bob.user.id}`)
      .set("Authorization", `Bearer ${login.accessToken}`)
      .expect(204);
    const privateRequest = await request(httpServer())
      .post("/api/v1/friend-requests")
      .set("Authorization", `Bearer ${bob.accessToken}`)
      .send({ userId: alice.user.id })
      .expect(403);
    expect(apiErrorEnvelopeSchema.parse(privateRequest.body).code).toBe("PRIVACY_RESTRICTED");
    await request(httpServer())
      .post("/api/v1/reports")
      .set("Authorization", `Bearer ${login.accessToken}`)
      .send({ userId: bob.user.id, category: "SPAM", description: "E2E report" })
      .expect(202);

    const rotatedResponse = await request(httpServer())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: login.refreshToken })
      .expect(200);
    const rotated = tokenResponseSchema.parse(rotatedResponse.body);
    expect(rotated.refreshToken).not.toBe(login.refreshToken);

    const replayResponse = await request(httpServer())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: login.refreshToken })
      .expect(401);
    expect(apiErrorEnvelopeSchema.parse(replayResponse.body).code).toBe("AUTH_REFRESH_REUSED");
    await request(httpServer())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: rotated.refreshToken })
      .expect(401);
  });

  it("does not distinguish unknown identities from incorrect passwords", async () => {
    const unknownResponse = await request(httpServer())
      .post("/api/v1/auth/login")
      .send({
        identity: { type: "EMAIL", value: "unknown@example.com" },
        password: "incorrect-password",
        device: device("unknown-browser"),
      })
      .expect(401);
    const wrongResponse = await request(httpServer())
      .post("/api/v1/auth/login")
      .send({
        identity: { type: "EMAIL", value: "bob@example.com" },
        password: "incorrect-password",
        device: device("bob-browser"),
      })
      .expect(401);
    const unknown = apiErrorEnvelopeSchema.parse(unknownResponse.body);
    const wrong = apiErrorEnvelopeSchema.parse(wrongResponse.body);
    expect({ code: unknown.code, message: unknown.message }).toEqual({
      code: wrong.code,
      message: wrong.message,
    });
  });

  async function register(
    email: string,
    username: string,
    clientDeviceId: string,
  ): Promise<TokenResponse> {
    const challengeResponse = await request(httpServer())
      .post("/api/v1/auth/registration-challenges")
      .send({ identity: { type: "EMAIL", value: email } })
      .expect(202);
    const challenge = challengeResponseSchema.parse(challengeResponse.body);
    expect(challenge.debugCode).toMatch(/^\d{6}$/);
    const response = await request(httpServer())
      .post("/api/v1/auth/register")
      .send({
        challengeId: challenge.challengeId,
        code: challenge.debugCode,
        username,
        password: `${username}-secure-password`,
        device: device(clientDeviceId),
      })
      .expect(201);
    return tokenResponseSchema.parse(response.body);
  }

  async function registerPhone(
    phone: string,
    username: string,
    clientDeviceId: string,
  ): Promise<TokenResponse> {
    const challengeResponse = await request(httpServer())
      .post("/api/v1/auth/registration-challenges")
      .send({ identity: { type: "PHONE", value: phone } })
      .expect(202);
    const challenge = challengeResponseSchema.parse(challengeResponse.body);
    const response = await request(httpServer())
      .post("/api/v1/auth/register")
      .send({
        challengeId: challenge.challengeId,
        code: challenge.debugCode,
        username,
        password: `${username}-secure-password`,
        device: { ...device(clientDeviceId), platform: "ANDROID" },
      })
      .expect(201);
    return tokenResponseSchema.parse(response.body);
  }

  function httpServer(): Server {
    return app.getHttpServer() as Server;
  }
});

function device(clientDeviceId: string) {
  return { clientDeviceId, platform: "WEB", name: "Browser", appVersion: "1.0.0" };
}

async function createKeys(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "slowchat-e2e-keys-"));
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  await Promise.all([
    writeFile(join(directory, "private.pem"), privateKey),
    writeFile(join(directory, "public.pem"), publicKey),
  ]);
  return directory;
}
