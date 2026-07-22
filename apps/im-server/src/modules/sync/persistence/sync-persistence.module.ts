import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { DeviceSyncStateEntity } from "./entities/device-sync-state.entity.js";
import { UserSyncEventEntity } from "./entities/user-sync-event.entity.js";

export const SYNC_ENTITIES = [UserSyncEventEntity, DeviceSyncStateEntity];

@Module({
  imports: [TypeOrmModule.forFeature(SYNC_ENTITIES)],
  exports: [TypeOrmModule],
})
export class SyncPersistenceModule {}
