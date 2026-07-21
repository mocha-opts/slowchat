import { Module } from "@nestjs/common";

import { AuthValidationModule } from "../modules/auth/auth-validation.module.js";
import { RealtimePublisherModule } from "../platform/realtime/realtime-publisher.module.js";
import { PlatformGateway } from "./platform.gateway.js";

@Module({
  imports: [AuthValidationModule, RealtimePublisherModule],
  providers: [PlatformGateway],
})
export class RealtimeModule {}
