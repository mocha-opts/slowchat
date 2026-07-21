import { Module } from "@nestjs/common";

import { ErrorHandlingModule } from "../common/errors/error-handling.module.js";
import { PlatformConfigModule } from "../platform/config/platform-config.module.js";
import { DatabaseModule } from "../platform/database/database.module.js";
import { HealthModule } from "../platform/health/health.module.js";
import { PlatformLoggerModule } from "../platform/logger/platform-logger.module.js";
import { RabbitMqModule } from "../platform/rabbitmq/rabbitmq.module.js";
import { RedisModule } from "../platform/redis/redis.module.js";
import { RequestContextModule } from "../platform/request-context/request-context.module.js";

@Module({
  imports: [
    PlatformConfigModule.forProcess("event-worker"),
    PlatformLoggerModule,
    RequestContextModule,
    ErrorHandlingModule,
    DatabaseModule,
    RedisModule.forRealtime(),
    RabbitMqModule,
    HealthModule,
  ],
})
export class EventWorkerAppModule {}
