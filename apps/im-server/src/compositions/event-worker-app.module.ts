import { Module } from "@nestjs/common";

import { ErrorHandlingModule } from "../common/errors/error-handling.module.js";
import { MessagingPersistenceModule } from "../modules/messaging-persistence/messaging-persistence.module.js";
import { OutboxRelayModule } from "../modules/outbox/outbox-relay.module.js";
import { RealtimeDispatchModule } from "../modules/outbox/realtime-dispatch.module.js";
import { PlatformConfigModule } from "../platform/config/platform-config.module.js";
import { DatabaseModule } from "../platform/database/database.module.js";
import { HealthModule } from "../platform/health/health.module.js";
import { PlatformLoggerModule } from "../platform/logger/platform-logger.module.js";
import { RabbitMqModule } from "../platform/rabbitmq/rabbitmq.module.js";
import { RedisModule } from "../platform/redis/redis.module.js";
import { RequestContextModule } from "../platform/request-context/request-context.module.js";
import { SyncPersistenceModule } from "../modules/sync/persistence/sync-persistence.module.js";
import { SyncProjectionModule } from "../modules/sync/sync-projection.module.js";

@Module({
  imports: [
    PlatformConfigModule.forProcess("event-worker"),
    PlatformLoggerModule,
    RequestContextModule,
    ErrorHandlingModule,
    DatabaseModule,
    MessagingPersistenceModule,
    RedisModule.forRealtime(),
    RabbitMqModule,
    OutboxRelayModule,
    RealtimeDispatchModule,
    HealthModule,
    SyncPersistenceModule,
    SyncProjectionModule,
  ],
})
export class EventWorkerAppModule {}
