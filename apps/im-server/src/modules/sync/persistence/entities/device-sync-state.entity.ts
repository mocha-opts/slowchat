import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

/** 每台设备独立保存服务端同步游标，设备之间不能互相覆盖进度。 */
@Entity({ name: "device_sync_states" })
export class DeviceSyncStateEntity {
  @PrimaryColumn({ name: "user_id", type: "uuid" }) userId!: string;
  @PrimaryColumn({ name: "device_id", type: "uuid" }) deviceId!: string;
  @Column({ name: "last_sync_event_id", type: "bigint", default: 0 }) lastSyncEventId!: string;
  @Column({ name: "client_version", type: "varchar", length: 100, nullable: true }) clientVersion!:
    string | null;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" }) updatedAt!: Date;
}
