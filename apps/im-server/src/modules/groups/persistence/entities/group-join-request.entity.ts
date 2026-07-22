import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "group_join_requests" })
export class GroupJoinRequestEntity {
  @PrimaryColumn("uuid") id!: string;
  @Column({ name: "conversation_id", type: "uuid" }) conversationId!: string;
  @Column({ name: "user_id", type: "uuid" }) userId!: string;
  @Column({ type: "varchar", length: 16, default: "PENDING" }) status!: string;
  @Column({ type: "varchar", length: 200, nullable: true }) message!: string | null;
  @Column({ name: "reviewer_id", type: "uuid", nullable: true }) reviewerId!: string | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" }) updatedAt!: Date;
}
