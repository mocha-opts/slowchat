import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "auth_sessions" })
export class AuthSessionEntity {
  @PrimaryColumn("uuid") id!: string;
  @Column({ name: "user_id", type: "uuid" }) userId!: string;
  @Column({ name: "device_id", type: "uuid" }) deviceId!: string;
  @Column({ name: "token_family_id", type: "uuid" }) tokenFamilyId!: string;
  @Column({ type: "varchar", length: 16, default: "ACTIVE" }) status!: string;
  @Column({ name: "revoked_reason", type: "varchar", length: 64, nullable: true })
  revokedReason!: string | null;
  @Column({ name: "last_ip", type: "inet", nullable: true }) lastIp!: string | null;
  @Column({ name: "last_user_agent", type: "varchar", length: 512, nullable: true })
  lastUserAgent!: string | null;
  @Column({ name: "last_used_at", type: "timestamptz" }) lastUsedAt!: Date;
  @Column({ name: "expires_at", type: "timestamptz" }) expiresAt!: Date;
  @Column({ name: "revoked_at", type: "timestamptz", nullable: true }) revokedAt!: Date | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" }) updatedAt!: Date;
}
