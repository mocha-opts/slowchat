import { Module } from "@nestjs/common";

import { AuthValidationModule } from "../auth/auth-validation.module.js";
import { ContactInteractionPolicyModule } from "../contacts/contact-interaction-policy.module.js";
import { OutboxWriterModule } from "../outbox/outbox-writer.module.js";
import { MessageCommandService } from "./services/message-command.service.js";
import { MessageQueryService } from "./services/message-query.service.js";

@Module({
  imports: [AuthValidationModule, ContactInteractionPolicyModule, OutboxWriterModule],
  providers: [MessageCommandService, MessageQueryService],
  exports: [MessageCommandService, MessageQueryService],
})
export class MessagesCoreModule {}
