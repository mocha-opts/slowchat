import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateConversationsMessagesOutbox1784649600000 implements MigrationInterface {
  name = "CreateConversationsMessagesOutbox1784649600000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE conversations (
        id uuid PRIMARY KEY,
        type varchar(16) NOT NULL,
        direct_key varchar(73),
        creator_id uuid NOT NULL REFERENCES users(id),
        owner_id uuid REFERENCES users(id),
        title varchar(128),
        avatar_attachment_id uuid,
        last_seq bigint NOT NULL DEFAULT 0,
        last_message_id uuid,
        last_message_at timestamptz,
        member_count integer NOT NULL DEFAULT 0,
        status varchar(16) NOT NULL DEFAULT 'ACTIVE',
        settings jsonb NOT NULL DEFAULT '{}',
        version integer NOT NULL DEFAULT 1,
        deleted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT conversations_type_ck CHECK (type IN ('DIRECT','GROUP','SYSTEM')),
        CONSTRAINT conversations_status_ck CHECK (status IN ('ACTIVE','ARCHIVED','DELETED')),
        CONSTRAINT conversations_direct_key_ck CHECK (
          (type = 'DIRECT' AND direct_key IS NOT NULL) OR (type <> 'DIRECT' AND direct_key IS NULL)
        ),
        CONSTRAINT conversations_last_seq_ck CHECK (last_seq >= 0),
        CONSTRAINT conversations_member_count_ck CHECK (member_count >= 0)
      );
      CREATE UNIQUE INDEX conversations_active_direct_uq ON conversations(direct_key)
        WHERE type = 'DIRECT' AND status = 'ACTIVE';
      CREATE INDEX conversations_last_message_idx ON conversations(last_message_at DESC, id DESC);

      CREATE TABLE conversation_members (
        conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id),
        role varchar(16) NOT NULL DEFAULT 'MEMBER',
        status varchar(16) NOT NULL DEFAULT 'ACTIVE',
        nickname varchar(64),
        joined_seq bigint NOT NULL DEFAULT 0,
        joined_at timestamptz NOT NULL DEFAULT now(),
        left_at timestamptz,
        mute_until timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY(conversation_id, user_id),
        CONSTRAINT conversation_members_role_ck CHECK (role IN ('OWNER','ADMIN','MEMBER')),
        CONSTRAINT conversation_members_status_ck CHECK (status IN ('ACTIVE','LEFT','REMOVED')),
        CONSTRAINT conversation_members_joined_seq_ck CHECK (joined_seq >= 0)
      );
      CREATE INDEX conversation_members_user_idx ON conversation_members(user_id, status, conversation_id);

      CREATE TABLE conversation_user_states (
        conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        last_delivered_seq bigint NOT NULL DEFAULT 0,
        last_read_seq bigint NOT NULL DEFAULT 0,
        clear_before_seq bigint NOT NULL DEFAULT 0,
        unread_count integer NOT NULL DEFAULT 0,
        mention_count integer NOT NULL DEFAULT 0,
        pinned_rank bigint,
        muted boolean NOT NULL DEFAULT false,
        archived_at timestamptz,
        hidden_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY(conversation_id, user_id),
        CONSTRAINT conversation_state_cursors_ck CHECK (
          last_delivered_seq >= 0 AND last_read_seq >= 0 AND clear_before_seq >= 0
          AND last_read_seq <= last_delivered_seq
        ),
        CONSTRAINT conversation_state_counts_ck CHECK (unread_count >= 0 AND mention_count >= 0)
      );
      CREATE INDEX conversation_states_user_list_idx
        ON conversation_user_states(user_id, pinned_rank DESC NULLS LAST, updated_at DESC, conversation_id DESC);

      CREATE TABLE messages (
        id uuid PRIMARY KEY,
        conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        seq bigint NOT NULL,
        sender_id uuid NOT NULL REFERENCES users(id),
        sender_device_id uuid NOT NULL REFERENCES devices(id),
        client_message_id uuid NOT NULL,
        content_hash char(64) NOT NULL,
        type varchar(32) NOT NULL,
        content_version integer NOT NULL,
        payload jsonb NOT NULL,
        text_preview varchar(280) NOT NULL,
        reply_to_message_id uuid,
        forward_from_message_id uuid,
        counts_unread boolean NOT NULL DEFAULT true,
        edited_at timestamptz,
        recalled_at timestamptz,
        recalled_by uuid REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT messages_seq_ck CHECK (seq > 0),
        CONSTRAINT messages_type_ck CHECK (type IN ('TEXT','IMAGE','FILE','AUDIO','VIDEO','LOCATION','CONTACT','RICH_CARD','CUSTOM','SYSTEM')),
        UNIQUE(conversation_id, seq),
        UNIQUE(sender_id, client_message_id)
      );
      CREATE INDEX messages_conversation_seq_idx ON messages(conversation_id, seq DESC);
      CREATE INDEX messages_sender_time_idx ON messages(sender_id, created_at DESC);
      ALTER TABLE conversations ADD CONSTRAINT conversations_last_message_fk
        FOREIGN KEY(last_message_id) REFERENCES messages(id) ON DELETE SET NULL;

      CREATE TABLE outbox_events (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        event_id uuid NOT NULL UNIQUE,
        event_type varchar(100) NOT NULL,
        event_version integer NOT NULL,
        routing_key varchar(100) NOT NULL,
        aggregate_type varchar(50) NOT NULL,
        aggregate_id uuid NOT NULL,
        payload jsonb NOT NULL,
        headers jsonb NOT NULL DEFAULT '{}',
        status varchar(16) NOT NULL DEFAULT 'PENDING',
        attempts integer NOT NULL DEFAULT 0,
        available_at timestamptz NOT NULL DEFAULT now(),
        locked_by varchar(128),
        locked_until timestamptz,
        published_at timestamptz,
        last_error varchar(1000),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT outbox_status_ck CHECK (status IN ('PENDING','PROCESSING','PUBLISHED','FAILED')),
        CONSTRAINT outbox_attempts_ck CHECK (attempts >= 0)
      );
      CREATE INDEX outbox_claim_idx ON outbox_events(status, available_at, created_at, id);
      CREATE INDEX outbox_lease_idx ON outbox_events(locked_until) WHERE status = 'PROCESSING';

      CREATE TABLE consumer_inbox_events (
        consumer_name varchar(100) NOT NULL,
        event_id uuid NOT NULL,
        event_type varchar(100) NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'PROCESSING',
        attempts integer NOT NULL DEFAULT 0,
        locked_by varchar(128),
        locked_until timestamptz,
        processed_at timestamptz,
        last_error varchar(1000),
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY(consumer_name, event_id),
        CONSTRAINT consumer_inbox_status_ck CHECK (status IN ('PROCESSING','PROCESSED','FAILED')),
        CONSTRAINT consumer_inbox_attempts_ck CHECK (attempts >= 0)
      );
      CREATE INDEX consumer_inbox_lease_idx ON consumer_inbox_events(locked_until)
        WHERE status = 'PROCESSING';
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE consumer_inbox_events;
      DROP TABLE outbox_events;
      ALTER TABLE conversations DROP CONSTRAINT conversations_last_message_fk;
      DROP TABLE messages;
      DROP TABLE conversation_user_states;
      DROP TABLE conversation_members;
      DROP TABLE conversations;
    `);
  }
}
