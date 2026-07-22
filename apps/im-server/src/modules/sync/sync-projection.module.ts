import { Module } from "@nestjs/common";

import { SyncProjectionService } from "./services/sync-projection.service.js";

@Module({ providers: [SyncProjectionService], exports: [SyncProjectionService] })
export class SyncProjectionModule {}
