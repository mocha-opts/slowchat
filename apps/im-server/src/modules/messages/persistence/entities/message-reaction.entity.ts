import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "message_reactions" })
export class MessageReactionEntity {
  @PrimaryColumn("uuid") id!: string;
  @Column({ name: "message_id", type: "uuid" }) messageId!: string;
  @Column({ name: "user_id", type: "uuid" }) userId!: string;
  @Column({ type: "varchar", length: 64 }) reaction!: string;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
}
