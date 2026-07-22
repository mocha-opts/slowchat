import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "consumer_inbox_events" })
export class ConsumerInboxEventEntity {
  @PrimaryColumn({ name: "consumer_name", type: "varchar", length: 100 }) consumerName!: string;
  @PrimaryColumn({ name: "event_id", type: "uuid" }) eventId!: string;
  @Column({ name: "event_type", type: "varchar", length: 100 }) eventType!: string;
  @Column({ type: "varchar", length: 16, default: "PROCESSING" }) status!: string;
  @Column({ type: "integer", default: 0 }) attempts!: number;
  @Column({ name: "locked_by", type: "varchar", length: 128, nullable: true }) lockedBy!:
    string | null;
  @Column({ name: "locked_until", type: "timestamptz", nullable: true }) lockedUntil!: Date | null;
  @Column({ name: "processed_at", type: "timestamptz", nullable: true }) processedAt!: Date | null;
  @Column({ name: "last_error", type: "varchar", length: 1000, nullable: true }) lastError!:
    string | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
}
