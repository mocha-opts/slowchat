import { Module } from "@nestjs/common";

import { AuthValidationModule } from "../auth/auth-validation.module.js";
import { ConversationsCoreModule } from "./conversations-core.module.js";
import { ConversationsController } from "./http/conversations.controller.js";
import { MessagesCoreModule } from "../messages/messages-core.module.js";

@Module({
  imports: [AuthValidationModule, ConversationsCoreModule, MessagesCoreModule],
  controllers: [ConversationsController],
})
export class ConversationsHttpModule {}
