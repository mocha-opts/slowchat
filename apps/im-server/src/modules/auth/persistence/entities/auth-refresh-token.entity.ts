import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "auth_refresh_tokens" })
export class AuthRefreshTokenEntity {
  @PrimaryColumn("uuid") id!: string;
  @Column({ name: "session_id", type: "uuid" }) sessionId!: string;
  @Column({ name: "token_family_id", type: "uuid" }) tokenFamilyId!: string;
  @Column({ name: "token_hash", type: "char", length: 64, unique: true }) tokenHash!: string;
  @Column({ type: "varchar", length: 16, default: "ACTIVE" }) status!: string;
  @Column({ name: "replaced_by_token_id", type: "uuid", nullable: true })
  replacedByTokenId!: string | null;
  @Column({ name: "used_at", type: "timestamptz", nullable: true }) usedAt!: Date | null;
  @Column({ name: "expires_at", type: "timestamptz" }) expiresAt!: Date;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
}
