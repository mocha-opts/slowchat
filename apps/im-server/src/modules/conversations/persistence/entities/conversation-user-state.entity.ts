import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

import { safeBigintTransformer } from "../../../messaging-persistence/bigint.transformer.js";

@Entity({ name: "conversation_user_states" })
export class ConversationUserStateEntity {
  @PrimaryColumn({ name: "conversation_id", type: "uuid" }) conversationId!: string;
  @PrimaryColumn({ name: "user_id", type: "uuid" }) userId!: string;
  @Column({
    name: "last_delivered_seq",
    type: "bigint",
    default: 0,
    transformer: safeBigintTransformer,
  })
  lastDeliveredSeq!: number;
  @Column({ name: "last_read_seq", type: "bigint", default: 0, transformer: safeBigintTransformer })
  lastReadSeq!: number;
  @Column({
    name: "clear_before_seq",
    type: "bigint",
    default: 0,
    transformer: safeBigintTransformer,
  })
  clearBeforeSeq!: number;
  @Column({ name: "unread_count", type: "integer", default: 0 }) unreadCount!: number;
  @Column({ name: "mention_count", type: "integer", default: 0 }) mentionCount!: number;
  @Column({
    name: "pinned_rank",
    type: "bigint",
    nullable: true,
    transformer: safeBigintTransformer,
  })
  pinnedRank!: number | null;
  @Column({ type: "boolean", default: false }) muted!: boolean;
  @Column({ name: "archived_at", type: "timestamptz", nullable: true }) archivedAt!: Date | null;
  @Column({ name: "hidden_at", type: "timestamptz", nullable: true }) hiddenAt!: Date | null;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" }) updatedAt!: Date;
}
