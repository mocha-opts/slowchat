import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "outbox_events" })
export class OutboxEventEntity {
  @PrimaryGeneratedColumn({ type: "bigint" }) id!: string;
  @Column({ name: "event_id", type: "uuid", unique: true }) eventId!: string;
  @Column({ name: "event_type", type: "varchar", length: 100 }) eventType!: string;
  @Column({ name: "event_version", type: "integer" }) eventVersion!: number;
  @Column({ name: "routing_key", type: "varchar", length: 100 }) routingKey!: string;
  @Column({ name: "aggregate_type", type: "varchar", length: 50 }) aggregateType!: string;
  @Column({ name: "aggregate_id", type: "uuid" }) aggregateId!: string;
  @Column({ type: "jsonb" }) payload!: Record<string, unknown>;
  @Column({ type: "jsonb", default: () => "'{}'::jsonb" }) headers!: Record<string, unknown>;
  @Column({ type: "varchar", length: 16, default: "PENDING" }) status!: string;
  @Column({ type: "integer", default: 0 }) attempts!: number;
  @Column({ name: "available_at", type: "timestamptz" }) availableAt!: Date;
  @Column({ name: "locked_by", type: "varchar", length: 128, nullable: true }) lockedBy!:
    string | null;
  @Column({ name: "locked_until", type: "timestamptz", nullable: true }) lockedUntil!: Date | null;
  @Column({ name: "published_at", type: "timestamptz", nullable: true }) publishedAt!: Date | null;
  @Column({ name: "last_error", type: "varchar", length: 1000, nullable: true }) lastError!:
    string | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
}
