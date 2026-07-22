import { Module } from "@nestjs/common";

import { AuthValidationModule } from "../auth/auth-validation.module.js";
import { MessagesController } from "./http/messages.controller.js";
import { MessagesCoreModule } from "./messages-core.module.js";

@Module({
  imports: [AuthValidationModule, MessagesCoreModule],
  controllers: [MessagesController],
})
export class MessagesHttpModule {}
