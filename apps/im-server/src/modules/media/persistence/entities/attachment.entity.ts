import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";
import { safeBigintTransformer } from "../../../messaging-persistence/bigint.transformer.js";

@Entity({ name: "attachments" })
export class AttachmentEntity {
  @PrimaryColumn("uuid") id!: string;
  @Column({ name: "owner_id", type: "uuid" }) ownerId!: string;
  @Column({ type: "varchar", length: 16 }) kind!: string;
  @Column({ name: "object_key", type: "varchar", length: 512, unique: true }) objectKey!: string;
  @Column({ name: "file_name", type: "varchar", length: 255 }) fileName!: string;
  @Column({ name: "content_type", type: "varchar", length: 127 }) contentType!: string;
  @Column({ name: "size_bytes", type: "bigint", transformer: safeBigintTransformer })
  sizeBytes!: number;
  @Column({ name: "checksum_sha256", type: "char", length: 64, nullable: true })
  checksumSha256!: string | null;
  @Column({ type: "varchar", length: 16, default: "UPLOADING" }) status!: string;
  @Column({ type: "jsonb", default: {} }) metadata!: Record<string, unknown>;
  @Column({ name: "ready_at", type: "timestamptz", nullable: true }) readyAt!: Date | null;
  @Column({ name: "expires_at", type: "timestamptz", nullable: true }) expiresAt!: Date | null;
  @Column({ name: "failure_reason", type: "varchar", length: 255, nullable: true })
  failureReason!: string | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" }) updatedAt!: Date;
}
