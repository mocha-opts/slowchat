import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "users" })
export class UserEntity {
  @PrimaryColumn("uuid") id!: string;
  @Column({ type: "varchar", length: 32, nullable: true }) username!: string | null;
  @Column({ name: "username_normalized", type: "varchar", length: 32, nullable: true })
  usernameNormalized!: string | null;
  @Column({ type: "varchar", length: 64 }) nickname!: string;
  @Column({ name: "avatar_url", type: "varchar", length: 2048, nullable: true })
  avatarUrl!: string | null;
  @Column({ type: "varchar", length: 280, nullable: true }) signature!: string | null;
  @Column({ type: "varchar", length: 64, nullable: true }) region!: string | null;
  @Column({ type: "varchar", length: 16, default: "ACTIVE" }) status!: string;
  @Column({ name: "user_type", type: "varchar", length: 16, default: "USER" }) userType!: string;
  @Column({ type: "jsonb", default: () => "'{}'::jsonb" }) extensions!: Record<string, unknown>;
  @Column({ type: "integer", default: 1 }) version!: number;
  @Column({ name: "last_online_at", type: "timestamptz", nullable: true })
  lastOnlineAt!: Date | null;
  @Column({ name: "deleted_at", type: "timestamptz", nullable: true }) deletedAt!: Date | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" }) updatedAt!: Date;
}
