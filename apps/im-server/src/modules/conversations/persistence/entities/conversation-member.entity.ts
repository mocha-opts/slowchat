import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

import { safeBigintTransformer } from "../../../messaging-persistence/bigint.transformer.js";

@Entity({ name: "conversation_members" })
export class ConversationMemberEntity {
  @PrimaryColumn({ name: "conversation_id", type: "uuid" }) conversationId!: string;
  @PrimaryColumn({ name: "user_id", type: "uuid" }) userId!: string;
  @Column({ type: "varchar", length: 16, default: "MEMBER" }) role!: string;
  @Column({ type: "varchar", length: 16, default: "ACTIVE" }) status!: string;
  @Column({ type: "varchar", length: 64, nullable: true }) nickname!: string | null;
  @Column({ name: "joined_seq", type: "bigint", default: 0, transformer: safeBigintTransformer })
  joinedSeq!: number;
  @Column({ name: "joined_at", type: "timestamptz" }) joinedAt!: Date;
  @Column({ name: "left_at", type: "timestamptz", nullable: true }) leftAt!: Date | null;
  @Column({ name: "mute_until", type: "timestamptz", nullable: true }) muteUntil!: Date | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" }) updatedAt!: Date;
}
