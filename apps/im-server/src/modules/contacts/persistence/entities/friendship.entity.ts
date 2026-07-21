import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "friendships" })
export class FriendshipEntity {
  @PrimaryColumn({ name: "user_id", type: "uuid" }) userId!: string;
  @PrimaryColumn({ name: "contact_user_id", type: "uuid" }) contactUserId!: string;
  @Column({ type: "varchar", length: 100, nullable: true }) remark!: string | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
}
