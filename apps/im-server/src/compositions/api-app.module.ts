import { Module } from "@nestjs/common";

import { ErrorHandlingModule } from "../common/errors/error-handling.module.js";
import { ContactsModule } from "../modules/contacts/contacts.module.js";
import { ConversationsHttpModule } from "../modules/conversations/conversations-http.module.js";
import { DevicesModule } from "../modules/devices/devices.module.js";
import { UsersModule } from "../modules/users/users.module.js";
import { IdentityPersistenceModule } from "../modules/identity-persistence.module.js";
import { MessagesHttpModule } from "../modules/messages/messages-http.module.js";
import { MessagingPersistenceModule } from "../modules/messaging-persistence/messaging-persistence.module.js";
import { PlatformConfigModule } from "../platform/config/platform-config.module.js";
import { DatabaseModule } from "../platform/database/database.module.js";
import { HealthModule } from "../platform/health/health.module.js";
import { PlatformLoggerModule } from "../platform/logger/platform-logger.module.js";
import { RedisModule } from "../platform/redis/redis.module.js";
import { RequestContextModule } from "../platform/request-context/request-context.module.js";
import { RealtimePublisherModule } from "../platform/realtime/realtime-publisher.module.js";
import { StorageModule } from "../platform/storage/storage.module.js";
import { SyncHttpModule } from "../modules/sync/sync-http.module.js";
import { SyncPersistenceModule } from "../modules/sync/persistence/sync-persistence.module.js";
import { GroupsModule } from "../modules/groups/groups.module.js";
import { MediaModule } from "../modules/media/media.module.js";

@Module({
  imports: [
    PlatformConfigModule.forProcess("api"),
    PlatformLoggerModule,
    RequestContextModule,
    ErrorHandlingModule,
    DatabaseModule,
    IdentityPersistenceModule,
    MessagingPersistenceModule,
    RedisModule.forRealtime(),
    RealtimePublisherModule,
    StorageModule,
    HealthModule,
    UsersModule,
    DevicesModule,
    ContactsModule,
    ConversationsHttpModule,
    MessagesHttpModule,
    SyncPersistenceModule,
    SyncHttpModule,
    GroupsModule,
    MediaModule,
  ],
})
export class ApiAppModule {}
