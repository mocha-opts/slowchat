import { Module } from "@nestjs/common";

import { AuthValidationModule } from "../auth/auth-validation.module.js";
import { ConversationsCoreModule } from "./conversations-core.module.js";
import { ConversationsController } from "./http/conversations.controller.js";

@Module({
  imports: [AuthValidationModule, ConversationsCoreModule],
  controllers: [ConversationsController],
})
export class ConversationsHttpModule {}
