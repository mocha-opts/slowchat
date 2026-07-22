import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "group_invites" })
export class GroupInviteEntity {
  @PrimaryColumn("uuid") id!: string;
  @Column({ name: "conversation_id", type: "uuid" }) conversationId!: string;
  @Column({ name: "inviter_id", type: "uuid" }) inviterId!: string;
  @Column({ name: "invitee_id", type: "uuid" }) inviteeId!: string;
  @Column({ type: "varchar", length: 16, default: "PENDING" }) status!: string;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" }) updatedAt!: Date;
}
