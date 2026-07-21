import type { INestApplicationContext } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { Server, ServerOptions } from "socket.io";

import type { ManagedRedis } from "../platform/redis/managed-redis.js";

export class RedisIoAdapter extends IoAdapter {
  private readonly publisher;
  private readonly subscriber;
  private disposed = false;

  constructor(app: INestApplicationContext, redis: ManagedRedis) {
    super(app);
    this.publisher = redis.client.duplicate({ keyPrefix: undefined, lazyConnect: true });
    this.subscriber = redis.client.duplicate({ keyPrefix: undefined, lazyConnect: true });
  }

  async connect(): Promise<void> {
    await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
  }

  override createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, options) as Server;
    server.adapter(
      createAdapter(this.publisher, this.subscriber, { key: "im:realtime:socket.io" }),
    );
    return server;
  }

  override async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await Promise.all([
      this.closeRedisClient(this.publisher),
      this.closeRedisClient(this.subscriber),
    ]);
  }

  private async closeRedisClient(client: typeof this.publisher): Promise<void> {
    if (client.status === "ready") {
      await client.quit();
      return;
    }
    client.disconnect(false);
  }
}
