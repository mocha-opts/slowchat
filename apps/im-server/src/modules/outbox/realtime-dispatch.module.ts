import { Module } from "@nestjs/common";

import { RealtimePublisherModule } from "../../platform/realtime/realtime-publisher.module.js";
import { RealtimeDispatchService } from "./services/realtime-dispatch.service.js";

@Module({
  imports: [RealtimePublisherModule],
  providers: [RealtimeDispatchService],
  exports: [RealtimeDispatchService],
})
export class RealtimeDispatchModule {}
