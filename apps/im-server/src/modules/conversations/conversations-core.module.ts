import { Module } from "@nestjs/common";

import { AuthValidationModule } from "../auth/auth-validation.module.js";
import { ContactInteractionPolicyModule } from "../contacts/contact-interaction-policy.module.js";
import { OutboxWriterModule } from "../outbox/outbox-writer.module.js";
import { ConversationCommandService } from "./services/conversation-command.service.js";
import { ConversationQueryService } from "./services/conversation-query.service.js";

@Module({
  imports: [AuthValidationModule, ContactInteractionPolicyModule, OutboxWriterModule],
  providers: [ConversationCommandService, ConversationQueryService],
  exports: [ConversationCommandService, ConversationQueryService],
})
export class ConversationsCoreModule {}
