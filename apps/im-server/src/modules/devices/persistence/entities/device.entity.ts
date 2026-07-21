import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "devices" })
export class DeviceEntity {
  @PrimaryColumn("uuid") id!: string;
  @Column({ name: "user_id", type: "uuid" }) userId!: string;
  @Column({ name: "client_device_id", type: "varchar", length: 128 }) clientDeviceId!: string;
  @Column({ type: "varchar", length: 16 }) platform!: string;
  @Column({ type: "varchar", length: 100 }) name!: string;
  @Column({ name: "app_version", type: "varchar", length: 50, nullable: true })
  appVersion!: string | null;
  @Column({ type: "varchar", length: 16, default: "ACTIVE" }) status!: string;
  @Column({ name: "last_ip", type: "inet", nullable: true }) lastIp!: string | null;
  @Column({ name: "last_user_agent", type: "varchar", length: 512, nullable: true })
  lastUserAgent!: string | null;
  @Column({ name: "last_seen_at", type: "timestamptz" }) lastSeenAt!: Date;
  @Column({ name: "revoked_at", type: "timestamptz", nullable: true }) revokedAt!: Date | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" }) updatedAt!: Date;
}
