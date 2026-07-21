import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "auth_login_attempts" })
export class AuthLoginAttemptEntity {
  @PrimaryGeneratedColumn({ type: "bigint" }) id!: string;
  @Column({ name: "identity_hash", type: "char", length: 64 }) identityHash!: string;
  @Column({ name: "user_id", type: "uuid", nullable: true }) userId!: string | null;
  @Column({ type: "inet", nullable: true }) ip!: string | null;
  @Column({ name: "client_device_id", type: "varchar", length: 128, nullable: true })
  clientDeviceId!: string | null;
  @Column({ type: "varchar", length: 32 }) result!: string;
  @Column({ name: "risk_reasons", type: "jsonb", default: () => "'[]'::jsonb" })
  riskReasons!: string[];
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
}
