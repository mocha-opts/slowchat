import { Module } from "@nestjs/common";

import { OutboxRelayService } from "./services/outbox-relay.service.js";

@Module({ providers: [OutboxRelayService], exports: [OutboxRelayService] })
export class OutboxRelayModule {}
