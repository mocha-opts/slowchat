import "reflect-metadata";

import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { GenericContainer, Wait, type StartedTestContainer } from "@im/test-utils";
import {
  challengeResponseSchema,
  conversationListResponseSchema,
  conversationSchema,
  friendRequestSchema,
  messageHistoryResponseSchema,
  messageRangeSchema,
  snapshotSchema,
  syncResponseSchema,
  tokenResponseSchema,
  groupProfileSchema,
  groupInviteSchema,
  groupMembersResponseSchema,
  attachmentDownloadSchema,
  completeUploadResponseSchema,
  uploadSessionSchema,
  type TokenResponse,
} from "@im/contracts/api";
import { apiErrorEnvelopeSchema } from "@im/contracts/errors";
import { messageAcceptedSchema, receiptSchema } from "@im/contracts/messages";
import { wsAckSchema, wsServerEventSchema } from "@im/contracts/websocket";
import { io, type Socket } from "socket.io-client";
import request from "supertest";
import { DataSource } from "typeorm";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ApiAppModule } from "../../src/compositions/api-app.module.js";
import { EventWorkerAppModule } from "../../src/compositions/event-worker-app.module.js";
import { RealtimeAppModule } from "../../src/compositions/realtime-app.module.js";
import { JobWorkerAppModule } from "../../src/compositions/job-worker-app.module.js";
import { createDatabaseOptions } from "../../src/platform/database/database-options.js";
import { CreateAuthUsersContacts1784563200000 } from "../../src/platform/database/migrations/202607210001-create-auth-users-contacts.js";
import { CreateConversationsMessagesOutbox1784649600000 } from "../../src/platform/database/migrations/202607220001-create-conversations-messages-outbox.js";
import { CreateSyncProjection1784736000000 } from "../../src/platform/database/migrations/202607230001-create-sync-projection.js";
import { CreateGroups1784822400000 } from "../../src/platform/database/migrations/202607240001-create-groups.js";
import { CreateMedia1784908800000 } from "../../src/platform/database/migrations/202607250001-create-media.js";
import { RabbitMqService } from "../../src/platform/rabbitmq/rabbitmq.service.js";
import type { ManagedRedis } from "../../src/platform/redis/managed-redis.js";
import { REDIS_REALTIME } from "../../src/platform/redis/redis.tokens.js";
import { RequestContextMiddleware } from "../../src/platform/request-context/request-context.middleware.js";
import { RedisIoAdapter } from "../../src/realtime/redis-io.adapter.js";

describe("P3 direct messaging E2E", () => {
  let postgres: StartedTestContainer;
  let redis: StartedTestContainer;
  let rabbitMq: StartedTestContainer;
  let minio: StartedTestContainer;
  let keyDirectory: string;
  let migrationDataSource: DataSource;
  let api: INestApplication;
  let realtime: INestApplication;
  let eventWorker: INestApplication;
  let jobWorker: INestApplication;
  let realtimeUrl: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    [postgres, redis, rabbitMq, minio] = await Promise.all([
      new GenericContainer("postgres:18.3-alpine")
        .withEnvironment({ POSTGRES_DB: "im", POSTGRES_USER: "im", POSTGRES_PASSWORD: "secret" })
        .withExposedPorts(5432)
        .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
        .start(),
      new GenericContainer("redis:8.6-alpine").withExposedPorts(6379).start(),
      new GenericContainer("rabbitmq:4.2-management-alpine")
        .withEnvironment({ RABBITMQ_DEFAULT_USER: "im", RABBITMQ_DEFAULT_PASS: "secret" })
        .withExposedPorts(5672)
        .withWaitStrategy(Wait.forLogMessage(/Server startup complete/))
        .start(),
      new GenericContainer("quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z")
        .withCommand(["server", "/data"])
        .withEnvironment({ MINIO_ROOT_USER: "im_minio", MINIO_ROOT_PASSWORD: "minio_secret" })
        .withExposedPorts(9000)
        .withWaitStrategy(Wait.forHttp("/minio/health/live", 9000))
        .start(),
    ]);
    keyDirectory = await createKeys();
    Object.assign(process.env, environment());
    migrationDataSource = new DataSource({
      ...createDatabaseOptions(process.env.DATABASE_URL!),
      entities: [],
      migrations: [
        CreateAuthUsersContacts1784563200000,
        CreateConversationsMessagesOutbox1784649600000,
        CreateSyncProjection1784736000000,
        CreateGroups1784822400000,
        CreateMedia1784908800000,
      ],
    });
    await migrationDataSource.initialize();
    await migrationDataSource.runMigrations();

    api = await createApplication(ApiAppModule);
    await api.init();

    realtime = await createApplication(RealtimeAppModule);
    const adapter = new RedisIoAdapter(realtime, realtime.get<ManagedRedis>(REDIS_REALTIME));
    await adapter.connect();
    realtime.useWebSocketAdapter(adapter);
    await realtime.listen(0, "127.0.0.1");
    const realtimeServer = realtime.getHttpServer() as Server;
    const address = realtimeServer.address();
    if (!address || typeof address === "string") throw new Error("Realtime port was not allocated");
    realtimeUrl = `http://127.0.0.1:${address.port}`;

    eventWorker = await createApplication(EventWorkerAppModule);
    await eventWorker.init();
    await waitUntil(() => eventWorker.get(RabbitMqService).isReady());
    jobWorker = await createApplication(JobWorkerAppModule);
    await jobWorker.init();
  });

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    if (eventWorker) await eventWorker.close();
    if (jobWorker) await jobWorker.close();
    if (realtime) await realtime.close();
    if (api) await api.close();
    if (migrationDataSource?.isInitialized) {
      await migrationDataSource.undoLastMigration();
      await migrationDataSource.undoLastMigration();
      await migrationDataSource.undoLastMigration();
      await migrationDataSource.undoLastMigration();
      await migrationDataSource.undoLastMigration();
      await migrationDataSource.destroy();
    }
    await Promise.all(
      [postgres, redis, rabbitMq, minio]
        .filter((container): container is StartedTestContainer => Boolean(container))
        .map((container) => container.stop()),
    );
    if (keyDirectory) await rm(keyDirectory, { recursive: true, force: true });
  });

  it("supports reliable HTTP/WS direct messaging, receipts, hide recovery and block policy", async () => {
    const alice = await register("p3-alice@example.com", "p3_alice", "p3-alice-device");
    const bob = await register("p3-bob@example.com", "p3_bob", "p3-bob-device");
    const friendResponse = await request(httpServer())
      .post("/api/v1/friend-requests")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ userId: bob.user.id })
      .expect(201);
    const friend = friendRequestSchema.parse(friendResponse.body);
    await request(httpServer())
      .post(`/api/v1/friend-requests/${friend.id}/accept`)
      .set("Authorization", `Bearer ${bob.accessToken}`)
      .expect(201);

    const directResponse = await request(httpServer())
      .post("/api/v1/conversations/direct")
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ userId: bob.user.id })
      .expect(201);
    const conversation = conversationSchema.parse(directResponse.body);
    const duplicateDirect = await request(httpServer())
      .post("/api/v1/conversations/direct")
      .set("Authorization", `Bearer ${bob.accessToken}`)
      .send({ userId: alice.user.id })
      .expect(201);
    expect(conversationSchema.parse(duplicateDirect.body).id).toBe(conversation.id);

    const aliceSocket = await connect(alice);
    const bobSocket = await connect(bob);
    const firstCreated = nextEvent(bobSocket, "message.created");
    const clientMessageId = uuidv7();
    const firstResponse = await request(httpServer())
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .set("Idempotency-Key", clientMessageId)
      .send(textMessage(clientMessageId, "hello from HTTP"))
      .expect(201);
    const first = messageAcceptedSchema.parse(firstResponse.body);
    expect(first.duplicate).toBe(false);
    await waitUntil(async () => {
      const rows = await migrationDataSource.query<Array<{ status: string }>>(
        "SELECT status FROM outbox_events WHERE aggregate_id = $1",
        [first.messageId],
      );
      return rows[0]?.status === "PUBLISHED";
    });
    await waitUntil(async () => {
      const rows = await migrationDataSource.query<Array<{ status: string }>>(
        `SELECT inbox.status
           FROM consumer_inbox_events inbox
           JOIN outbox_events outbox ON outbox.event_id = inbox.event_id
          WHERE outbox.aggregate_id = $1`,
        [first.messageId],
      );
      return rows[0]?.status === "PROCESSED";
    });
    expect(wsServerEventSchema.parse(await firstCreated).eventId).toMatch(/^[0-9a-f-]{36}$/);

    await waitUntil(async () => {
      const rows = await migrationDataSource.query<Array<{ count: string }>>(
        "SELECT count(*)::text AS count FROM user_sync_events WHERE user_id = $1",
        [alice.user.id],
      );
      return Number(rows[0]?.count ?? 0) > 0;
    });
    const sync = syncResponseSchema.parse(
      (
        await request(httpServer())
          .get(`/api/v1/sync/events?deviceId=${alice.device.id}&after=0&limit=50`)
          .set("Authorization", `Bearer ${alice.accessToken}`)
          .expect(200)
      ).body,
    );
    expect(sync.events.some((event) => event.eventType === "message.created.v1")).toBe(true);
    const snapshot = snapshotSchema.parse(
      (
        await request(httpServer())
          .get(`/api/v1/sync/snapshot?deviceId=${alice.device.id}`)
          .set("Authorization", `Bearer ${alice.accessToken}`)
          .expect(200)
      ).body,
    );
    expect(snapshot.userSyncCursor).toBeGreaterThanOrEqual(sync.userSyncCursor);
    await migrationDataSource.query(
      `INSERT INTO user_sync_events(user_id, event_id, event_type, event_version, payload)
       VALUES ($1, $2, 'conversation.updated.v1', 1, '{}')`,
      [alice.user.id, uuidv7()],
    );
    await migrationDataSource.query(
      "UPDATE user_sync_events SET expires_at = now() - interval '1 minute' WHERE user_id = $1 AND id < $2",
      [alice.user.id, sync.userSyncCursor],
    );
    const expired = await request(httpServer())
      .get(`/api/v1/sync/events?deviceId=${alice.device.id}&after=1&limit=50`)
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .expect(410);
    expect(apiErrorEnvelopeSchema.parse(expired.body).code).toBe("SYNC_CURSOR_EXPIRED");
    const range = messageRangeSchema.parse(
      (
        await request(httpServer())
          .get(`/api/v1/conversations/${conversation.id}/messages/range?afterSeq=0&limit=50`)
          .set("Authorization", `Bearer ${alice.accessToken}`)
          .expect(200)
      ).body,
    );
    expect(range.messages.map((message) => message.seq)).toContain(first.seq);

    const duplicateResponse = await request(httpServer())
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send(textMessage(clientMessageId, "hello from HTTP"))
      .expect(201);
    expect(messageAcceptedSchema.parse(duplicateResponse.body)).toMatchObject({
      messageId: first.messageId,
      seq: first.seq,
      duplicate: true,
    });
    const conflict = await request(httpServer())
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send(textMessage(clientMessageId, "different"))
      .expect(409);
    expect(apiErrorEnvelopeSchema.parse(conflict.body).code).toBe("MESSAGE_IDEMPOTENCY_CONFLICT");

    const aliceReceives = nextEvent(aliceSocket, "message.created");
    const wsClientMessageId = uuidv7();
    const wsAck = wsAckSchema.parse(
      await emitWithAck(
        bobSocket,
        "message.send",
        command(bob, "message.send", {
          conversationId: conversation.id,
          ...textMessage(wsClientMessageId, "hello from WS"),
        }),
      ),
    );
    expect(wsAck).toMatchObject({ ok: true, code: "OK" });
    const secondAccepted = messageAcceptedSchema.parse(wsAck.data);
    const secondCreated = wsServerEventSchema.parse(await aliceReceives);
    expect(secondCreated.event).toBe("message.created");

    const receiptEvent = nextEvent(aliceSocket, "receipt.updated");
    const deliveredAck = wsAckSchema.parse(
      await emitWithAck(
        aliceSocket,
        "message.delivered",
        command(alice, "message.delivered", {
          conversationId: conversation.id,
          lastDeliveredSeq: secondAccepted.seq,
        }),
      ),
    );
    expect(receiptSchema.parse(deliveredAck.data).lastDeliveredSeq).toBe(secondAccepted.seq);
    expect(wsServerEventSchema.parse(await receiptEvent).event).toBe("receipt.updated");

    const readResponse = await request(httpServer())
      .post(`/api/v1/conversations/${conversation.id}/read`)
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({ lastReadSeq: secondAccepted.seq })
      .expect(200);
    expect(receiptSchema.parse(readResponse.body)).toMatchObject({
      lastDeliveredSeq: secondAccepted.seq,
      lastReadSeq: secondAccepted.seq,
    });

    const history = await request(httpServer())
      .get(`/api/v1/conversations/${conversation.id}/messages?limit=20`)
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .expect(200);
    const historyBody = messageHistoryResponseSchema.parse(history.body);
    expect(historyBody.items.map((message) => message.seq)).toEqual([1, 2]);

    await request(httpServer())
      .delete(`/api/v1/conversations/${conversation.id}/view`)
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .expect(204);
    expect(
      conversationListResponseSchema.parse(
        (
          await request(httpServer())
            .get("/api/v1/conversations")
            .set("Authorization", `Bearer ${alice.accessToken}`)
            .expect(200)
        ).body,
      ).items,
    ).toHaveLength(0);
    await request(httpServer())
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Authorization", `Bearer ${bob.accessToken}`)
      .send(textMessage(uuidv7(), "restore hidden"))
      .expect(201);
    expect(
      conversationListResponseSchema.parse(
        (
          await request(httpServer())
            .get("/api/v1/conversations")
            .set("Authorization", `Bearer ${alice.accessToken}`)
            .expect(200)
        ).body,
      ).items,
    ).toHaveLength(1);

    await request(httpServer())
      .post(`/api/v1/blocks/${bob.user.id}`)
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .expect(204);
    const blocked = await request(httpServer())
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Authorization", `Bearer ${bob.accessToken}`)
      .send(textMessage(uuidv7(), "blocked"))
      .expect(403);
    expect(apiErrorEnvelopeSchema.parse(blocked.body).code).toBe("MESSAGE_FORBIDDEN");
    await request(httpServer())
      .delete(`/api/v1/blocks/${bob.user.id}`)
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .expect(204);

    await rabbitMq.exec(["rabbitmqctl", "stop_app"]);
    await waitUntil(() => !eventWorker.get(RabbitMqService).isPublisherReady());
    const outageMessage = await request(httpServer())
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send(textMessage(uuidv7(), "accepted during broker outage"))
      .expect(201);
    const outageAccepted = messageAcceptedSchema.parse(outageMessage.body);
    const pending = await migrationDataSource.query<Array<{ status: string }>>(
      `SELECT status FROM outbox_events WHERE aggregate_id = $1`,
      [outageAccepted.messageId],
    );
    expect(pending[0]?.status).toBe("PENDING");
    await rabbitMq.exec(["rabbitmqctl", "start_app"]);
    await waitUntil(() => eventWorker.get(RabbitMqService).isReady());
    await waitUntil(async () => {
      const rows = await migrationDataSource.query<Array<{ status: string }>>(
        `SELECT status FROM outbox_events WHERE aggregate_id = $1`,
        [outageAccepted.messageId],
      );
      return rows[0]?.status === "PUBLISHED";
    });
  });

  it("supports group membership, shared system messages and group text", async () => {
    const owner = await register("p5-owner@example.com", "p5_owner", "p5-owner-device");
    const member = await register("p5-member@example.com", "p5_member", "p5-member-device");
    const outsider = await register("p5-outsider@example.com", "p5_outsider", "p5-outsider-device");
    const created = await request(httpServer())
      .post("/api/v1/conversations/groups")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ title: "P5 team", joinMode: "INVITE_ONLY" })
      .expect(201);
    const createdConversation = conversationSchema.parse(created.body);
    const group = groupProfileSchema.parse(
      (
        await request(httpServer())
          .get(`/api/v1/conversations/${createdConversation.id}/group`)
          .set("Authorization", `Bearer ${owner.accessToken}`)
          .expect(200)
      ).body,
    );
    expect(group.title).toBe("P5 team");
    const invite = await request(httpServer())
      .post(`/api/v1/conversations/${group.conversationId}/invites`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ userId: member.user.id })
      .expect(201);
    const inviteRecord = groupInviteSchema.parse(invite.body);
    await request(httpServer())
      .post(`/api/v1/group-invites/${inviteRecord.id}/decision`)
      .set("Authorization", `Bearer ${member.accessToken}`)
      .send({ decision: "ACCEPTED" })
      .expect(201);
    const members = await request(httpServer())
      .get(`/api/v1/conversations/${group.conversationId}/members`)
      .set("Authorization", `Bearer ${member.accessToken}`)
      .expect(200);
    const memberList = groupMembersResponseSchema.parse(members.body);
    expect(memberList.items.map((item) => item.user.id)).toEqual(
      expect.arrayContaining([owner.user.id, member.user.id]),
    );
    await request(httpServer())
      .post(`/api/v1/conversations/${group.conversationId}/messages`)
      .set("Authorization", `Bearer ${member.accessToken}`)
      .send(textMessage(uuidv7(), "hello group"))
      .expect(201);
    await request(httpServer())
      .post(`/api/v1/conversations/${group.conversationId}/messages`)
      .set("Authorization", `Bearer ${outsider.accessToken}`)
      .send(textMessage(uuidv7(), "not allowed"))
      .expect(403);
    await request(httpServer())
      .delete(`/api/v1/conversations/${group.conversationId}/members/${member.user.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .expect(204);
    await request(httpServer())
      .post(`/api/v1/conversations/${group.conversationId}/messages`)
      .set("Authorization", `Bearer ${member.accessToken}`)
      .send(textMessage(uuidv7(), "removed"))
      .expect(403);
  });

  it("supports direct-to-MinIO upload, idempotent processing and IMAGE messages", async () => {
    const alice = await register("p6-alice@example.com", "p6_alice", "p6-alice-device");
    const bob = await register("p6-bob@example.com", "p6_bob", "p6-bob-device");
    const friend = friendRequestSchema.parse(
      (
        await request(httpServer())
          .post("/api/v1/friend-requests")
          .set("Authorization", `Bearer ${alice.accessToken}`)
          .send({ userId: bob.user.id })
          .expect(201)
      ).body,
    );
    await request(httpServer())
      .post(`/api/v1/friend-requests/${friend.id}/accept`)
      .set("Authorization", `Bearer ${bob.accessToken}`)
      .expect(201);
    const conversation = conversationSchema.parse(
      (
        await request(httpServer())
          .post("/api/v1/conversations/direct")
          .set("Authorization", `Bearer ${alice.accessToken}`)
          .send({ userId: bob.user.id })
          .expect(201)
      ).body,
    );
    const upload = uploadSessionSchema.parse(
      (
        await request(httpServer())
          .post("/api/v1/uploads")
          .set("Authorization", `Bearer ${alice.accessToken}`)
          .send({ kind: "IMAGE", fileName: "pixel.png", contentType: "image/png", sizeBytes: 8 })
          .expect(201)
      ).body,
    );
    const png = Buffer.from("89504e470d0a1a0a", "hex");
    await fetch(upload.uploadUrl!, {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: png,
    });
    const completed = completeUploadResponseSchema.parse(
      (
        await request(httpServer())
          .post(`/api/v1/uploads/${upload.id}/complete`)
          .set("Authorization", `Bearer ${alice.accessToken}`)
          .expect(201)
      ).body,
    );
    expect(completed.status).toBe("PROCESSING");
    await waitUntil(async () => {
      const current = uploadSessionSchema.parse(
        (
          await request(httpServer())
            .get(`/api/v1/uploads/${upload.id}`)
            .set("Authorization", `Bearer ${alice.accessToken}`)
        ).body,
      );
      return current.attachment.status === "READY";
    });
    const imageMessage = await request(httpServer())
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Authorization", `Bearer ${alice.accessToken}`)
      .send({
        clientMessageId: uuidv7(),
        type: "IMAGE",
        contentVersion: 1,
        payload: { attachmentId: upload.attachmentId },
      })
      .expect(201);
    expect(messageAcceptedSchema.parse(imageMessage.body).status).toBe("ACCEPTED");
    const download = attachmentDownloadSchema.parse(
      (
        await request(httpServer())
          .get(`/api/v1/attachments/${upload.attachmentId}/download`)
          .set("Authorization", `Bearer ${bob.accessToken}`)
          .expect(200)
      ).body,
    );
    expect(download.downloadUrl).toContain("X-Amz");
  });

  async function register(
    email: string,
    username: string,
    clientDeviceId: string,
  ): Promise<TokenResponse> {
    const challenge = challengeResponseSchema.parse(
      (
        await request(httpServer())
          .post("/api/v1/auth/registration-challenges")
          .send({ identity: { type: "EMAIL", value: email } })
          .expect(202)
      ).body,
    );
    return tokenResponseSchema.parse(
      (
        await request(httpServer())
          .post("/api/v1/auth/register")
          .send({
            challengeId: challenge.challengeId,
            code: challenge.debugCode,
            username,
            password: `${username}-secure-password`,
            device: { clientDeviceId, platform: "WEB", name: "Browser", appVersion: "1.0" },
          })
          .expect(201)
      ).body,
    );
  }

  async function connect(token: TokenResponse): Promise<Socket> {
    const socket = io(realtimeUrl, {
      autoConnect: false,
      transports: ["websocket"],
      auth: { token: token.accessToken },
      extraHeaders: { Origin: "http://localhost:3000" },
    });
    sockets.push(socket);
    const ready = nextEvent(socket, "connection.ready");
    socket.connect();
    await ready;
    return socket;
  }

  function httpServer(): Server {
    return api.getHttpServer() as Server;
  }

  function environment(): NodeJS.ProcessEnv {
    return {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      DATABASE_URL: `postgresql://im:secret@${postgres.getHost()}:${postgres.getMappedPort(5432)}/im`,
      REDIS_REALTIME_URL: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}/0`,
      REDIS_REALTIME_PREFIX: "im:p3:realtime:",
      REDIS_JOBS_URL: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}/1`,
      REDIS_JOBS_PREFIX: "im:p3:jobs:",
      RABBITMQ_URL: `amqp://im:secret@${rabbitMq.getHost()}:${rabbitMq.getMappedPort(5672)}`,
      OUTBOX_POLL_INTERVAL_MS: "25",
      OUTBOX_BATCH_SIZE: "100",
      OUTBOX_LOCK_MS: "1000",
      OUTBOX_MAX_ATTEMPTS: "20",
      OUTBOX_RETRY_BASE_MS: "100",
      OUTBOX_RETRY_MAX_MS: "1000",
      RABBITMQ_PREFETCH: "10",
      RABBITMQ_RETRY_DELAYS_MS: "100,200,300",
      RABBITMQ_CONSUMER_LEASE_MS: "1000",
      S3_ENDPOINT: `http://${minio.getHost()}:${minio.getMappedPort(9000)}`,
      S3_REGION: "us-east-1",
      S3_ACCESS_KEY: "im_minio",
      S3_SECRET_KEY: "minio_secret",
      S3_BUCKET: "im-p3-e2e",
      S3_FORCE_PATH_STYLE: "true",
      S3_AUTO_CREATE_BUCKET: "true",
      MEDIA_SCANNER_MODE: "deterministic",
      MEDIA_UPLOAD_TTL_SECONDS: "3600",
      MEDIA_MAX_IMAGE_BYTES: "20971520",
      MEDIA_MAX_FILE_BYTES: "1073741824",
      JWT_ISSUER: "slowchat-p3-e2e",
      JWT_AUDIENCE: "slowchat-p3-e2e-clients",
      JWT_KEY_ID: "p3-e2e-rs256",
      JWT_PRIVATE_KEY_PATH: join(keyDirectory, "private.pem"),
      JWT_PUBLIC_KEY_PATH: join(keyDirectory, "public.pem"),
      AUTH_REFRESH_TOKEN_PEPPER: "p3-refresh-token-pepper-at-least-32-bytes",
      AUTH_CHALLENGE_PEPPER: "p3-challenge-pepper-at-least-32-bytes-value",
      AUTH_IDENTIFIER_PEPPER: "p3-identifier-pepper-at-least-32-bytes",
      AUTH_MAX_DEVICES: "5",
      AUTH_EXPOSE_CHALLENGE_CODE: "true",
      AUTH_ALLOWED_WS_ORIGINS: "http://localhost:3000",
    };
  }
});

async function createApplication(
  module: new (...args: never[]) => unknown,
): Promise<INestApplication> {
  const testingModule = await Test.createTestingModule({ imports: [module] }).compile();
  const app = testingModule.createNestApplication();
  const context = app.get(RequestContextMiddleware);
  app.use(context.use.bind(context));
  return app;
}

function textMessage(clientMessageId: string, text: string) {
  return { clientMessageId, type: "TEXT", contentVersion: 1, payload: { text } };
}

function command(token: TokenResponse, event: string, data: unknown) {
  return {
    version: 1,
    event,
    requestId: uuidv7(),
    deviceId: token.device.id,
    timestamp: Date.now(),
    data,
  };
}

function emitWithAck(socket: Socket, event: string, payload: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event} ACK`)), 10_000);
    socket.emit(event, payload, (value: unknown) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

function nextEvent(socket: Socket, event: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 15_000);
    socket.once(event, (value: unknown) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

async function waitUntil(
  check: () => boolean | Promise<boolean>,
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Condition was not met before timeout");
}

async function createKeys(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "slowchat-p3-e2e-keys-"));
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
