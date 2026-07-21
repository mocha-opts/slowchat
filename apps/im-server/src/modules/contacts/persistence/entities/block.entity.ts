import { CreateDateColumn, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "blocks" })
export class BlockEntity {
  @PrimaryColumn({ name: "user_id", type: "uuid" }) userId!: string;
  @PrimaryColumn({ name: "blocked_user_id", type: "uuid" }) blockedUserId!: string;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
}
