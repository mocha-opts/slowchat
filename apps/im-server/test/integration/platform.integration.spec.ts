import "reflect-metadata";

import { createServer, type Server as HttpServer } from "node:http";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { createAdapter } from "@socket.io/redis-adapter";
import { GenericContainer, Wait, type StartedTestContainer } from "@im/test-utils";
import amqp from "amqplib";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import type { PinoLogger } from "nestjs-pino";
import { Server as SocketServer } from "socket.io";
import { io as createSocketClient, type Socket } from "socket.io-client";
import { DataSource, type MigrationInterface, type QueryRunner } from "typeorm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../../src/platform/config/app-config.js";
import { createDatabaseOptions } from "../../src/platform/database/database-options.js";
import { RabbitMqService } from "../../src/platform/rabbitmq/rabbitmq.service.js";
import { ManagedRedis } from "../../src/platform/redis/managed-redis.js";
import { S3ObjectStorageService } from "../../src/platform/storage/s3-object-storage.service.js";

class TestBaselineMigration implements MigrationInterface {
  readonly name = "TestBaselineMigration1784592000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("CREATE TABLE p1_migration_probe (id integer PRIMARY KEY)");
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE p1_migration_probe");
  }
}

describe("P1 platform integrations", () => {
  let postgres: StartedTestContainer;
  let redisRealtime: StartedTestContainer;
  let redisJobs: StartedTestContainer;
  let rabbitMq: StartedTestContainer;
  let minio: StartedTestContainer;

  beforeAll(async () => {
    [postgres, redisRealtime, redisJobs, rabbitMq, minio] = await Promise.all([
      new GenericContainer("postgres:18.3-alpine")
        .withEnvironment({ POSTGRES_DB: "im", POSTGRES_USER: "im", POSTGRES_PASSWORD: "secret" })
        .withExposedPorts(5432)
        .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
        .start(),
      new GenericContainer("redis:8.6-alpine").withExposedPorts(6379).start(),
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
  });

  afterAll(async () => {
    await Promise.all(
      [postgres, redisRealtime, redisJobs, rabbitMq, minio]
        .filter((container): container is StartedTestContainer => Boolean(container))
        .map((container) => container.stop()),
    );
  });

  it("runs and reverts a test-only PostgreSQL migration with synchronize disabled", async () => {
    const databaseUrl = `postgresql://im:secret@${postgres.getHost()}:${postgres.getMappedPort(5432)}/im`;
    const options = createDatabaseOptions(databaseUrl);
    expect(options.synchronize).toBe(false);
    const dataSource = new DataSource({
      ...options,
      entities: [],
      migrations: [TestBaselineMigration],
    });
    await dataSource.initialize();

    await dataSource.runMigrations();
    expect(await dataSource.query("SELECT to_regclass('p1_migration_probe') AS name")).toEqual([
      { name: "p1_migration_probe" },
    ]);
    await dataSource.undoLastMigration();
    expect(await dataSource.query("SELECT to_regclass('p1_migration_probe') AS name")).toEqual([
      { name: null },
    ]);
    await dataSource.destroy();
  });

  it("keeps Realtime and Jobs Redis connections isolated", async () => {
    const realtime = new ManagedRedis(
      "realtime",
      `redis://${redisRealtime.getHost()}:${redisRealtime.getMappedPort(6379)}`,
      "im:realtime:",
      silentLogger(),
    );
    const jobs = new ManagedRedis(
      "jobs",
      `redis://${redisJobs.getHost()}:${redisJobs.getMappedPort(6379)}`,
      "im:jobs:",
      silentLogger(),
    );
    await Promise.all([realtime.onModuleInit(), jobs.onModuleInit()]);
    await realtime.client.set("probe", "realtime");
    await jobs.client.set("probe", "jobs");

    expect(await realtime.client.get("probe")).toBe("realtime");
    expect(await jobs.client.get("probe")).toBe("jobs");
    expect(redisRealtime.getId()).not.toBe(redisJobs.getId());
    await Promise.all([realtime.onApplicationShutdown(), jobs.onApplicationShutdown()]);
  });

  it("publishes with RabbitMQ confirms and consumes through a bound queue", async () => {
    const url = `amqp://im:secret@${rabbitMq.getHost()}:${rabbitMq.getMappedPort(5672)}`;
    const connection = await amqp.connect(url);
    const channel = await connection.createChannel();
    await channel.assertExchange("p1.smoke", "direct", { durable: false });
    const queue = await channel.assertQueue("", { exclusive: true });
    await channel.bindQueue(queue.queue, "p1.smoke", "probe");
    const received = new Promise<string>((resolve) => {
      void channel.consume(queue.queue, (message) => {
        if (message) resolve(message.content.toString());
      });
    });
    const config = createConfig({ rabbitMqUrl: url });
    const service = new RabbitMqService(config, silentLogger());
    await service.onModuleInit();
    await service.publish("p1.smoke", "probe", Buffer.from("confirmed"));

    await expect(received).resolves.toBe("confirmed");
    await expect(
      service.publish("p1.smoke", "not-bound", Buffer.from("unroutable")),
    ).rejects.toThrow("unroutable");
    await service.onApplicationShutdown();
    await channel.close();
    await connection.close();
  });

  it("starts unready and schedules recovery when RabbitMQ is unavailable", async () => {
    const errorLog = vi.fn();
    const logger = { setContext: vi.fn(), error: errorLog } as unknown as PinoLogger;
    const service = new RabbitMqService(
      createConfig({ rabbitMqUrl: "amqp://127.0.0.1:1" }),
      logger,
    );

    await service.onModuleInit();
    expect(service.isReady()).toBe(false);
    expect(errorLog).toHaveBeenCalled();
    await service.onApplicationShutdown();
  });

  it("deduplicates a BullMQ smoke job by stable job id", async () => {
    const connection = {
      host: redisJobs.getHost(),
      port: redisJobs.getMappedPort(6379),
      maxRetriesPerRequest: null,
    };
    const queueName = `p1-smoke-${Date.now()}`;
    const queue = new Queue(queueName, { connection, prefix: "im:jobs" });
    const processor = vi.fn(() => Promise.resolve("done"));
    const worker = new Worker(queueName, processor, { connection, prefix: "im:jobs" });
    const completed = new Promise<void>((resolve, reject) => {
      worker.once("completed", () => resolve());
      worker.once("failed", (_, error) => reject(error));
    });

    const first = await queue.add("probe", {}, { jobId: "stable-job-id" });
    const duplicate = await queue.add("probe", {}, { jobId: "stable-job-id" });
    expect(first.id).toBe(duplicate.id);
    await completed;
    expect(processor).toHaveBeenCalledOnce();
    await worker.close();
    await queue.obliterate({ force: true });
    await queue.close();
  });

  it("creates a private MinIO bucket and a short-lived presigned PUT URL", async () => {
    const endpoint = `http://${minio.getHost()}:${minio.getMappedPort(9000)}`;
    const client = new S3Client({
      endpoint,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: { accessKeyId: "im_minio", secretAccessKey: "minio_secret" },
    });
    await client.send(new CreateBucketCommand({ Bucket: "im-test" })).catch(() => undefined);
    client.destroy();
    const storage = new S3ObjectStorageService(createConfig({ s3Endpoint: endpoint }));

    expect(await storage.isReady()).toBe(true);
    const url = await storage.createPresignedPutUrl("probe/file.txt", 60);
    expect(url).toContain("X-Amz-Signature");
    expect(url).not.toContain("minio_secret");
    storage.onApplicationShutdown();
  });

  it("broadcasts a Socket.IO room event across two Redis-adapted servers", async () => {
    const redisUrl = `redis://${redisRealtime.getHost()}:${redisRealtime.getMappedPort(6379)}`;
    const first = await createSocketServer(redisUrl);
    const second = await createSocketServer(redisUrl);
    let client: Socket | undefined;
    try {
      const joined = new Promise<void>((resolve) => {
        first.io.on("connection", (socket) => {
          const result = socket.join("room:p1");
          if (result instanceof Promise) void result.then(() => resolve());
          else resolve();
        });
      });
      client = createSocketClient(`http://127.0.0.1:${first.port}`, { transports: ["websocket"] });
      await new Promise<void>((resolve, reject) => {
        client?.once("connect", resolve);
        client?.once("connect_error", reject);
      });
      await joined;
      await new Promise((resolve) => setTimeout(resolve, 100));
      const received = new Promise<string>((resolve) => client?.once("p1.probe", resolve));
      second.io.to("room:p1").emit("p1.probe", "cross-node");
      await expect(received).resolves.toBe("cross-node");
    } finally {
      client?.disconnect();
      await Promise.all([closeSocketServer(first), closeSocketServer(second)]);
    }
  });
});

function createConfig(overrides: { rabbitMqUrl?: string; s3Endpoint?: string } = {}): AppConfig {
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
    rabbitMqUrl: overrides.rabbitMqUrl ?? "amqp://unused",
    s3: {
      endpoint: overrides.s3Endpoint ?? "http://unused",
      region: "us-east-1",
      accessKey: "im_minio",
      secretKey: "minio_secret",
      bucket: "im-test",
      forcePathStyle: true,
      autoCreateBucket: false,
    },
  };
}

function silentLogger(): PinoLogger {
  return { setContext: vi.fn(), error: vi.fn() } as unknown as PinoLogger;
}

interface SocketServerFixture {
  readonly http: HttpServer;
  readonly io: SocketServer;
  readonly port: number;
  readonly publisher: Redis;
  readonly subscriber: Redis;
}

async function createSocketServer(redisUrl: string): Promise<SocketServerFixture> {
  const http = createServer();
  const io = new SocketServer(http);
  const publisher = new Redis(redisUrl, { lazyConnect: true });
  const subscriber = publisher.duplicate({ lazyConnect: true });
  publisher.on("error", () => undefined);
  subscriber.on("error", () => undefined);
  await Promise.all([publisher.connect(), subscriber.connect()]);
  io.adapter(createAdapter(publisher, subscriber, { key: "im:realtime:socket.io-test" }));
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const address = http.address();
  if (!address || typeof address === "string") throw new Error("Socket test server has no port");
  return { http, io, port: address.port, publisher, subscriber };
}

async function closeSocketServer(fixture: SocketServerFixture): Promise<void> {
  await new Promise<void>((resolve) => {
    void fixture.io.close(() => resolve());
  });
  if (fixture.http.listening) {
    await new Promise<void>((resolve, reject) =>
      fixture.http.close((error) => (error ? reject(error) : resolve())),
    );
  }
  await Promise.all([fixture.publisher.quit(), fixture.subscriber.quit()]);
}
