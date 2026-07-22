import type { MigrationInterface, QueryRunner } from "typeorm";

/** P6 媒体表只保存元数据；对象字节始终留在私有 S3/MinIO。 */
export class CreateMedia1784908800000 implements MigrationInterface {
  name = "CreateMedia1784908800000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE attachments (
        id uuid PRIMARY KEY,
        owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind varchar(16) NOT NULL,
        object_key varchar(512) NOT NULL UNIQUE,
        file_name varchar(255) NOT NULL,
        content_type varchar(127) NOT NULL,
        size_bytes bigint NOT NULL,
        checksum_sha256 char(64),
        status varchar(16) NOT NULL DEFAULT 'UPLOADING',
        metadata jsonb NOT NULL DEFAULT '{}',
        ready_at timestamptz,
        expires_at timestamptz,
        failure_reason varchar(255),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT attachments_kind_ck CHECK (kind IN ('IMAGE','FILE')),
        CONSTRAINT attachments_status_ck CHECK (status IN ('UPLOADING','UPLOADED','PROCESSING','READY','FAILED','QUARANTINED','DELETED')),
        CONSTRAINT attachments_size_ck CHECK (size_bytes > 0)
      );
      CREATE INDEX attachments_owner_created_idx ON attachments(owner_id, created_at DESC);
      CREATE INDEX attachments_status_expire_idx ON attachments(status, expires_at);

      CREATE TABLE upload_sessions (
        id uuid PRIMARY KEY,
        owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        attachment_id uuid NOT NULL UNIQUE REFERENCES attachments(id) ON DELETE CASCADE,
        status varchar(16) NOT NULL DEFAULT 'OPEN',
        kind varchar(16) NOT NULL,
        file_name varchar(255) NOT NULL,
        content_type varchar(127) NOT NULL,
        size_bytes bigint NOT NULL,
        checksum_sha256 char(64),
        object_key varchar(512) NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        completed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT upload_sessions_status_ck CHECK (status IN ('OPEN','COMPLETED','EXPIRED','CANCELLED')),
        CONSTRAINT upload_sessions_kind_ck CHECK (kind IN ('IMAGE','FILE')),
        CONSTRAINT upload_sessions_size_ck CHECK (size_bytes > 0)
      );
      CREATE INDEX upload_sessions_owner_created_idx ON upload_sessions(owner_id, created_at DESC);
      CREATE INDEX upload_sessions_expire_idx ON upload_sessions(status, expires_at);

      CREATE TABLE media_variants (
        id uuid PRIMARY KEY,
        attachment_id uuid NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
        variant_kind varchar(32) NOT NULL,
        object_key varchar(512) NOT NULL UNIQUE,
        content_type varchar(127) NOT NULL,
        size_bytes bigint NOT NULL,
        checksum_sha256 char(64),
        metadata jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT media_variants_size_ck CHECK (size_bytes > 0),
        UNIQUE (attachment_id, variant_kind)
      );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS media_variants;
      DROP INDEX IF EXISTS upload_sessions_expire_idx;
      DROP INDEX IF EXISTS upload_sessions_owner_created_idx;
      DROP TABLE IF EXISTS upload_sessions;
      DROP INDEX IF EXISTS attachments_status_expire_idx;
      DROP INDEX IF EXISTS attachments_owner_created_idx;
      DROP TABLE IF EXISTS attachments;
    `);
  }
}
