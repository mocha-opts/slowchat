import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";
import { safeBigintTransformer } from "../../../messaging-persistence/bigint.transformer.js";

@Entity({ name: "upload_sessions" })
export class UploadSessionEntity {
  @PrimaryColumn("uuid") id!: string;
  @Column({ name: "owner_id", type: "uuid" }) ownerId!: string;
  @Column({ name: "attachment_id", type: "uuid", unique: true }) attachmentId!: string;
  @Column({ type: "varchar", length: 16, default: "OPEN" }) status!: string;
  @Column({ type: "varchar", length: 16 }) kind!: string;
  @Column({ name: "file_name", type: "varchar", length: 255 }) fileName!: string;
  @Column({ name: "content_type", type: "varchar", length: 127 }) contentType!: string;
  @Column({ name: "size_bytes", type: "bigint", transformer: safeBigintTransformer })
  sizeBytes!: number;
  @Column({ name: "checksum_sha256", type: "char", length: 64, nullable: true })
  checksumSha256!: string | null;
  @Column({ name: "object_key", type: "varchar", length: 512, unique: true }) objectKey!: string;
  @Column({ name: "expires_at", type: "timestamptz" }) expiresAt!: Date;
  @Column({ name: "completed_at", type: "timestamptz", nullable: true }) completedAt!: Date | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" }) updatedAt!: Date;
}
