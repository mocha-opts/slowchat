import "reflect-metadata";

import { RealtimeAppModule } from "../compositions/realtime-app.module.js";
import type { ManagedRedis } from "../platform/redis/managed-redis.js";
import { REDIS_REALTIME } from "../platform/redis/redis.tokens.js";
import { RedisIoAdapter } from "../realtime/redis-io.adapter.js";
import { bootstrapProcess } from "./bootstrap.js";

await bootstrapProcess(RealtimeAppModule, "realtime", {
  configure: async (app) => {
    const adapter = new RedisIoAdapter(app, app.get<ManagedRedis>(REDIS_REALTIME));
    await adapter.connect();
    app.useWebSocketAdapter(adapter);
  },
});
