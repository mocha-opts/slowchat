import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "auth_challenges" })
export class AuthChallengeEntity {
  @PrimaryColumn("uuid") id!: string;
  @Column({ type: "varchar", length: 32 }) purpose!: string;
  @Column({ name: "identity_type", type: "varchar", length: 16 }) identityType!: string;
  @Column({ name: "identity_value", type: "varchar", length: 254 }) identityValue!: string;
  @Column({ name: "code_hash", type: "char", length: 64 }) codeHash!: string;
  @Column({ type: "integer", default: 0 }) attempts!: number;
  @Column({ name: "send_count", type: "integer", default: 1 }) sendCount!: number;
  @Column({ name: "expires_at", type: "timestamptz" }) expiresAt!: Date;
  @Column({ name: "consumed_at", type: "timestamptz", nullable: true }) consumedAt!: Date | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
}
