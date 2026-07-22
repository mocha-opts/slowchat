import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";

import { safeBigintTransformer } from "../../../messaging-persistence/bigint.transformer.js";

@Entity({ name: "messages" })
export class MessageEntity {
  @PrimaryColumn("uuid") id!: string;
  @Column({ name: "conversation_id", type: "uuid" }) conversationId!: string;
  @Column({ type: "bigint", transformer: safeBigintTransformer }) seq!: number;
  @Column({ name: "sender_id", type: "uuid" }) senderId!: string;
  @Column({ name: "sender_device_id", type: "uuid" }) senderDeviceId!: string;
  @Column({ name: "client_message_id", type: "uuid" }) clientMessageId!: string;
  @Column({ name: "content_hash", type: "char", length: 64 }) contentHash!: string;
  @Column({ type: "varchar", length: 32 }) type!: string;
  @Column({ name: "content_version", type: "integer" }) contentVersion!: number;
  @Column({ type: "jsonb" }) payload!: Record<string, unknown>;
  @Column({ name: "text_preview", type: "varchar", length: 280 }) textPreview!: string;
  @Column({ name: "reply_to_message_id", type: "uuid", nullable: true })
  replyToMessageId!: string | null;
  @Column({ name: "forward_from_message_id", type: "uuid", nullable: true })
  forwardFromMessageId!: string | null;
  @Column({ name: "counts_unread", type: "boolean", default: true }) countsUnread!: boolean;
  @Column({ name: "edited_at", type: "timestamptz", nullable: true }) editedAt!: Date | null;
  @Column({ name: "recalled_at", type: "timestamptz", nullable: true }) recalledAt!: Date | null;
  @Column({ name: "recalled_by", type: "uuid", nullable: true }) recalledBy!: string | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
}
