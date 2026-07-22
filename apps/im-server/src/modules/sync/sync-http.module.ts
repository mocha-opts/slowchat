import { Module } from "@nestjs/common";

import { AuthValidationModule } from "../auth/auth-validation.module.js";
import { ContactsModule } from "../contacts/contacts.module.js";
import { ConversationsCoreModule } from "../conversations/conversations-core.module.js";
import { DevicesModule } from "../devices/devices.module.js";
import { UsersModule } from "../users/users.module.js";
import { SyncPersistenceModule } from "./persistence/sync-persistence.module.js";
import { SyncController } from "./http/sync.controller.js";
import { SyncQueryService } from "./services/sync-query.service.js";

@Module({
  imports: [
    AuthValidationModule,
    SyncPersistenceModule,
    UsersModule,
    DevicesModule,
    ContactsModule,
    ConversationsCoreModule,
  ],
  controllers: [SyncController],
  providers: [SyncQueryService],
  exports: [SyncQueryService],
})
export class SyncHttpModule {}
