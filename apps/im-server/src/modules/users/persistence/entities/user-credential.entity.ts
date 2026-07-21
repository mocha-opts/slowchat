import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

import type { UserEntity } from "./user.entity.js";

@Entity({ name: "user_credentials" })
export class UserCredentialEntity {
  @PrimaryColumn({ name: "user_id", type: "uuid" }) userId!: string;
  user?: UserEntity;
  @Column({ name: "password_hash", type: "text", nullable: true }) passwordHash!: string | null;
  @Column({ name: "email_normalized", type: "varchar", length: 254, nullable: true })
  emailNormalized!: string | null;
  @Column({ name: "phone_e164", type: "varchar", length: 16, nullable: true }) phoneE164!:
    string | null;
  @Column({ name: "identity_verified_at", type: "timestamptz" }) identityVerifiedAt!: Date;
  @Column({ name: "password_changed_at", type: "timestamptz" }) passwordChangedAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" }) updatedAt!: Date;
}
