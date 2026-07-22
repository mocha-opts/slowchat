import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * 用户同步事件是离线恢复的事实索引，不复制消息正文事实。
 * PostgreSQL 的 bigint 游标保证同一用户的增量读取具有稳定顺序。
 */
@Entity({ name: "user_sync_events" })
@Index("user_sync_events_user_id_id_idx", ["userId", "id"])
@Index("user_sync_events_expires_at_idx", ["expiresAt"])
export class UserSyncEventEntity {
  @PrimaryGeneratedColumn({ type: "bigint" }) id!: string;
  @Column({ name: "user_id", type: "uuid" }) userId!: string;
  @Column({ name: "event_id", type: "uuid" }) eventId!: string;
  @Column({ name: "event_type", type: "varchar", length: 100 }) eventType!: string;
  @Column({ name: "event_version", type: "integer" }) eventVersion!: number;
  @Column({ name: "entity_type", type: "varchar", length: 50, nullable: true }) entityType!:
    string | null;
  @Column({ name: "entity_id", type: "uuid", nullable: true }) entityId!: string | null;
  @Column({ name: "conversation_id", type: "uuid", nullable: true }) conversationId!: string | null;
  @Column({ type: "bigint", nullable: true }) seq!: string | null;
  @Column({ type: "jsonb" }) payload!: Record<string, unknown>;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
  @Column({ name: "expires_at", type: "timestamptz", nullable: true }) expiresAt!: Date | null;
}
