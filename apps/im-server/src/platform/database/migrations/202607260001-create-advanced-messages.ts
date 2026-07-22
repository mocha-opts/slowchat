import type { MigrationInterface, QueryRunner } from "typeorm";

/** P7 只增加用户视图和 Reaction 事实，不改变既有 messages.seq。 */
export class CreateAdvancedMessages1784995200000 implements MigrationInterface {
  name = "CreateAdvancedMessages1784995200000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE message_reactions (
        id uuid PRIMARY KEY,
        message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reaction varchar(64) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT message_reactions_reaction_ck CHECK (length(trim(reaction)) > 0),
        UNIQUE(message_id, user_id, reaction)
      );
      CREATE INDEX message_reactions_message_idx ON message_reactions(message_id, created_at, id);
      CREATE INDEX message_reactions_user_idx ON message_reactions(user_id, created_at DESC);

      CREATE TABLE message_user_hides (
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        hidden_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY(user_id, message_id)
      );
      CREATE INDEX message_user_hides_conversation_idx
        ON message_user_hides(user_id, message_id);

      CREATE INDEX messages_text_search_idx ON messages
        USING gin (to_tsvector('simple', coalesce(payload ->> 'text', '')));
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS messages_text_search_idx;
      DROP INDEX IF EXISTS message_user_hides_conversation_idx;
      DROP TABLE IF EXISTS message_user_hides;
      DROP INDEX IF EXISTS message_reactions_user_idx;
      DROP INDEX IF EXISTS message_reactions_message_idx;
      DROP TABLE IF EXISTS message_reactions;
    `);
  }
}
