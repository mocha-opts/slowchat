import { Global, Module } from "@nestjs/common";

import { RealtimeEventPublisherService } from "./realtime-event-publisher.service.js";
import { RealtimeRoomFactory } from "./realtime-room.factory.js";

@Global()
@Module({
  providers: [RealtimeRoomFactory, RealtimeEventPublisherService],
  exports: [RealtimeRoomFactory, RealtimeEventPublisherService],
})
export class RealtimePublisherModule {}
