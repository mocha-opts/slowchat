import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "group_profiles" })
export class GroupProfileEntity {
  @PrimaryColumn({ name: "conversation_id", type: "uuid" }) conversationId!: string;
  @Column({ type: "varchar", length: 128 }) title!: string;
  @Column({ type: "varchar", length: 2000, nullable: true }) announcement!: string | null;
  @Column({ name: "max_members", type: "integer", default: 500 }) maxMembers!: number;
  @Column({ name: "join_mode", type: "varchar", length: 16, default: "INVITE_ONLY" })
  joinMode!: string;
  @Column({ name: "allow_member_invites", type: "boolean", default: false })
  allowMemberInvites!: boolean;
  @Column({ name: "all_members_muted", type: "boolean", default: false })
  allMembersMuted!: boolean;
  @Column({ type: "integer", default: 1 }) version!: number;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" }) updatedAt!: Date;
}
