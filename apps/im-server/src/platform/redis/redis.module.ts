import { Module, type DynamicModule } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";

import { APP_CONFIG, type AppConfig } from "../config/app-config.js";
import { ManagedRedis } from "./managed-redis.js";
import { REDIS_JOBS, REDIS_REALTIME } from "./redis.tokens.js";

@Module({})
export class RedisModule {
  static forRealtime(): DynamicModule {
    return {
      module: RedisModule,
      providers: [
        {
          provide: REDIS_REALTIME,
          inject: [APP_CONFIG, PinoLogger],
          useFactory: (config: AppConfig, logger: PinoLogger) =>
            new ManagedRedis(
              "realtime",
              config.redis.realtimeUrl,
              config.redis.realtimePrefix,
              logger,
            ),
        },
      ],
      exports: [REDIS_REALTIME],
    };
  }

  static forJobs(): DynamicModule {
    return {
      module: RedisModule,
      providers: [
        {
          provide: REDIS_JOBS,
          inject: [APP_CONFIG, PinoLogger],
          useFactory: (config: AppConfig, logger: PinoLogger) =>
            new ManagedRedis("jobs", config.redis.jobsUrl, config.redis.jobsPrefix, logger),
        },
      ],
      exports: [REDIS_JOBS],
    };
  }
}
