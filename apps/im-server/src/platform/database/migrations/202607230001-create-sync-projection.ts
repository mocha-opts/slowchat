import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * P4 同步表只保存可重放的用户事件索引和设备游标；消息正文仍由 messages 表权威保存。
 */
export class CreateSyncProjection1784736000000 implements MigrationInterface {
  name = "CreateSyncProjection1784736000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE user_sync_events (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        event_id UUID NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        event_version INTEGER NOT NULL,
        entity_type VARCHAR(50),
        entity_id UUID,
        conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
        seq BIGINT,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX user_sync_events_user_event_uq
      ON user_sync_events(user_id, event_id)
    `);
    await queryRunner.query(`
      CREATE INDEX user_sync_events_user_id_id_idx
      ON user_sync_events(user_id, id)
    `);
    await queryRunner.query(`
      CREATE INDEX user_sync_events_expires_at_idx
      ON user_sync_events(expires_at)
      WHERE expires_at IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE TABLE device_sync_states (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        last_sync_event_id BIGINT NOT NULL DEFAULT 0,
        client_version VARCHAR(100),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY(user_id, device_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX device_sync_states_device_id_idx
      ON device_sync_states(device_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS device_sync_states_device_id_idx`);
    await queryRunner.query(`DROP TABLE IF EXISTS device_sync_states`);
    await queryRunner.query(`DROP INDEX IF EXISTS user_sync_events_expires_at_idx`);
    await queryRunner.query(`DROP INDEX IF EXISTS user_sync_events_user_id_id_idx`);
    await queryRunner.query(`DROP INDEX IF EXISTS user_sync_events_user_event_uq`);
    await queryRunner.query(`DROP TABLE IF EXISTS user_sync_events`);
  }
}
