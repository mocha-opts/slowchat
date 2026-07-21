import { Module } from "@nestjs/common";

import { PlatformGateway } from "./platform.gateway.js";

@Module({ providers: [PlatformGateway] })
export class RealtimeModule {}
