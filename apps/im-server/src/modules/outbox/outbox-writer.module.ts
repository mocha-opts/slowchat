import { Module } from "@nestjs/common";

import { OutboxWriterService } from "./services/outbox-writer.service.js";

@Module({ providers: [OutboxWriterService], exports: [OutboxWriterService] })
export class OutboxWriterModule {}
