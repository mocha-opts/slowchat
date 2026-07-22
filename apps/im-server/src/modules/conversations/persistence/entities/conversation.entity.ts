import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

import { safeBigintTransformer } from "../../../messaging-persistence/bigint.transformer.js";

@Entity({ name: "conversations" })
export class ConversationEntity {
  @PrimaryColumn("uuid") id!: string;
  @Column({ type: "varchar", length: 16 }) type!: string;
  @Column({ name: "direct_key", type: "varchar", length: 73, nullable: true })
  directKey!: string | null;
  @Column({ name: "creator_id", type: "uuid" }) creatorId!: string;
  @Column({ name: "owner_id", type: "uuid", nullable: true }) ownerId!: string | null;
  @Column({ type: "varchar", length: 128, nullable: true }) title!: string | null;
  @Column({ name: "avatar_attachment_id", type: "uuid", nullable: true })
  avatarAttachmentId!: string | null;
  @Column({ name: "last_seq", type: "bigint", default: 0, transformer: safeBigintTransformer })
  lastSeq!: number;
  @Column({ name: "last_message_id", type: "uuid", nullable: true })
  lastMessageId!: string | null;
  @Column({ name: "last_message_at", type: "timestamptz", nullable: true })
  lastMessageAt!: Date | null;
  @Column({ name: "member_count", type: "integer", default: 0 }) memberCount!: number;
  @Column({ type: "varchar", length: 16, default: "ACTIVE" }) status!: string;
  @Column({ type: "jsonb", default: () => "'{}'::jsonb" }) settings!: Record<string, unknown>;
  @Column({ type: "integer", default: 1 }) version!: number;
  @Column({ name: "deleted_at", type: "timestamptz", nullable: true }) deletedAt!: Date | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" }) updatedAt!: Date;
}
