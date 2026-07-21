import type { OnApplicationShutdown, OnModuleInit } from "@nestjs/common";
import { Redis } from "ioredis";
import type { PinoLogger } from "nestjs-pino";

export class ManagedRedis implements OnModuleInit, OnApplicationShutdown {
  readonly client: Redis;

  constructor(
    readonly name: "realtime" | "jobs",
    url: string,
    keyPrefix: string,
    private readonly logger: PinoLogger,
  ) {
    this.client = new Redis(url, {
      enableOfflineQueue: false,
      keyPrefix,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt: number) => Math.min(attempt * 200, 2_000),
    });
    this.client.on("error", (error: Error) => {
      this.logger.warn({ err: error, redis: this.name }, "Redis connection error");
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
  }

  async ping(): Promise<boolean> {
    return (await this.client.ping()) === "PONG";
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client.status === "ready") {
      await this.client.quit();
      return;
    }
    this.client.disconnect(false);
  }
}
