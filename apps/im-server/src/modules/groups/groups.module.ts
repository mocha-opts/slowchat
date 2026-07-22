import { Module } from "@nestjs/common";

import { AuthValidationModule } from "../auth/auth-validation.module.js";
import { ConversationsCoreModule } from "../conversations/conversations-core.module.js";
import { OutboxWriterModule } from "../outbox/outbox-writer.module.js";
import { GroupsPersistenceModule } from "./persistence/groups-persistence.module.js";
import { GroupsController } from "./http/groups.controller.js";
import { GroupCommandService } from "./services/group-command.service.js";
import { GroupQueryService } from "./services/group-query.service.js";
import { GroupSystemMessageService } from "./services/group-system-message.service.js";

@Module({
  imports: [
    AuthValidationModule,
    ConversationsCoreModule,
    OutboxWriterModule,
    GroupsPersistenceModule,
  ],
  controllers: [GroupsController],
  providers: [GroupCommandService, GroupQueryService, GroupSystemMessageService],
  exports: [GroupCommandService, GroupQueryService],
})
export class GroupsModule {}
