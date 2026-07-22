import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";
import { safeBigintTransformer } from "../../../messaging-persistence/bigint.transformer.js";

@Entity({ name: "media_variants" })
export class MediaVariantEntity {
  @PrimaryColumn("uuid") id!: string;
  @Column({ name: "attachment_id", type: "uuid" }) attachmentId!: string;
  @Column({ name: "variant_kind", type: "varchar", length: 32 }) variantKind!: string;
  @Column({ name: "object_key", type: "varchar", length: 512, unique: true }) objectKey!: string;
  @Column({ name: "content_type", type: "varchar", length: 127 }) contentType!: string;
  @Column({ name: "size_bytes", type: "bigint", transformer: safeBigintTransformer })
  sizeBytes!: number;
  @Column({ name: "checksum_sha256", type: "char", length: 64, nullable: true })
  checksumSha256!: string | null;
  @Column({ type: "jsonb", default: {} }) metadata!: Record<string, unknown>;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
}
