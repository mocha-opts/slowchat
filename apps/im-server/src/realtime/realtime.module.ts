import { Module } from "@nestjs/common";

import { AuthValidationModule } from "../modules/auth/auth-validation.module.js";
import { ConversationsCoreModule } from "../modules/conversations/conversations-core.module.js";
import { MessagesCoreModule } from "../modules/messages/messages-core.module.js";
import { RealtimePublisherModule } from "../platform/realtime/realtime-publisher.module.js";
import { PlatformGateway } from "./platform.gateway.js";
import { RealtimeCommandHandler } from "./realtime-command.handler.js";

@Module({
  imports: [
    AuthValidationModule,
    ConversationsCoreModule,
    MessagesCoreModule,
    RealtimePublisherModule,
  ],
  providers: [PlatformGateway, RealtimeCommandHandler],
})
export class RealtimeModule {}
