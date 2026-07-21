import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAuthUsersContacts1784563200000 implements MigrationInterface {
  name = "CreateAuthUsersContacts1784563200000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY, username varchar(32), username_normalized varchar(32),
        nickname varchar(64) NOT NULL, avatar_url varchar(2048), signature varchar(280),
        region varchar(64), status varchar(16) NOT NULL DEFAULT 'ACTIVE',
        user_type varchar(16) NOT NULL DEFAULT 'USER', extensions jsonb NOT NULL DEFAULT '{}',
        version integer NOT NULL DEFAULT 1, last_online_at timestamptz, deleted_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT users_status_ck CHECK (status IN ('ACTIVE','FROZEN','DISABLED','DELETED')),
        CONSTRAINT users_type_ck CHECK (user_type IN ('USER','BOT','SYSTEM'))
      );
      CREATE UNIQUE INDEX users_username_active_uq ON users (username_normalized)
        WHERE status <> 'DELETED';

      CREATE TABLE user_credentials (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        password_hash text, email_normalized varchar(254), phone_e164 varchar(16),
        identity_verified_at timestamptz NOT NULL, password_changed_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT user_credentials_identity_ck CHECK (email_normalized IS NOT NULL OR phone_e164 IS NOT NULL)
      );
      CREATE UNIQUE INDEX user_credentials_email_uq ON user_credentials(email_normalized)
        WHERE email_normalized IS NOT NULL;
      CREATE UNIQUE INDEX user_credentials_phone_uq ON user_credentials(phone_e164)
        WHERE phone_e164 IS NOT NULL;

      CREATE TABLE user_privacy_settings (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        search_audience varchar(16) NOT NULL DEFAULT 'EVERYONE',
        friend_request_audience varchar(16) NOT NULL DEFAULT 'EVERYONE',
        group_invite_audience varchar(16) NOT NULL DEFAULT 'CONTACTS',
        online_status_audience varchar(16) NOT NULL DEFAULT 'CONTACTS',
        last_seen_audience varchar(16) NOT NULL DEFAULT 'CONTACTS',
        allow_stranger_messages boolean NOT NULL DEFAULT false,
        allow_bot_direct_messages boolean NOT NULL DEFAULT false,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT privacy_search_ck CHECK (search_audience IN ('EVERYONE','CONTACTS','NOBODY')),
        CONSTRAINT privacy_friend_ck CHECK (friend_request_audience IN ('EVERYONE','CONTACTS','NOBODY')),
        CONSTRAINT privacy_group_ck CHECK (group_invite_audience IN ('EVERYONE','CONTACTS','NOBODY')),
        CONSTRAINT privacy_online_ck CHECK (online_status_audience IN ('EVERYONE','CONTACTS','NOBODY')),
        CONSTRAINT privacy_seen_ck CHECK (last_seen_audience IN ('EVERYONE','CONTACTS','NOBODY'))
      );

      CREATE TABLE devices (
        id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        client_device_id varchar(128) NOT NULL, platform varchar(16) NOT NULL,
        name varchar(100) NOT NULL, app_version varchar(50), status varchar(16) NOT NULL DEFAULT 'ACTIVE',
        last_ip inet, last_user_agent varchar(512), last_seen_at timestamptz NOT NULL,
        revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(user_id, client_device_id),
        CONSTRAINT devices_status_ck CHECK (status IN ('ACTIVE','REVOKED'))
      );
      CREATE INDEX devices_user_status_idx ON devices(user_id, status);

      CREATE TABLE auth_sessions (
        id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        token_family_id uuid NOT NULL, status varchar(16) NOT NULL DEFAULT 'ACTIVE',
        revoked_reason varchar(64), last_ip inet, last_user_agent varchar(512),
        last_used_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT auth_sessions_status_ck CHECK (status IN ('ACTIVE','REVOKED'))
      );
      CREATE INDEX auth_sessions_user_status_idx ON auth_sessions(user_id, status);
      CREATE INDEX auth_sessions_device_status_idx ON auth_sessions(device_id, status);

      CREATE TABLE auth_refresh_tokens (
        id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
        token_family_id uuid NOT NULL, token_hash char(64) NOT NULL UNIQUE,
        status varchar(16) NOT NULL DEFAULT 'ACTIVE', replaced_by_token_id uuid,
        used_at timestamptz, expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT refresh_status_ck CHECK (status IN ('ACTIVE','USED','REVOKED'))
      );
      CREATE INDEX refresh_session_idx ON auth_refresh_tokens(session_id);
      CREATE INDEX refresh_family_idx ON auth_refresh_tokens(token_family_id);

      CREATE TABLE auth_challenges (
        id uuid PRIMARY KEY, purpose varchar(32) NOT NULL, identity_type varchar(16) NOT NULL,
        identity_value varchar(254) NOT NULL, code_hash char(64) NOT NULL,
        attempts integer NOT NULL DEFAULT 0, send_count integer NOT NULL DEFAULT 1,
        expires_at timestamptz NOT NULL, consumed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT challenge_purpose_ck CHECK (purpose IN ('REGISTRATION','PASSWORD_RESET')),
        CONSTRAINT challenge_identity_ck CHECK (identity_type IN ('EMAIL','PHONE'))
      );
      CREATE INDEX challenges_identity_idx ON auth_challenges(identity_type, identity_value, purpose, created_at DESC);

      CREATE TABLE auth_login_attempts (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, identity_hash char(64) NOT NULL,
        user_id uuid REFERENCES users(id) ON DELETE SET NULL, ip inet, client_device_id varchar(128),
        result varchar(32) NOT NULL, risk_reasons jsonb NOT NULL DEFAULT '[]',
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX login_attempts_identity_time_idx ON auth_login_attempts(identity_hash, created_at DESC);

      CREATE TABLE friend_requests (
        id uuid PRIMARY KEY, requester_id uuid NOT NULL REFERENCES users(id),
        recipient_id uuid NOT NULL REFERENCES users(id), pair_low uuid NOT NULL, pair_high uuid NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'PENDING', message varchar(200),
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT friend_request_self_ck CHECK (requester_id <> recipient_id),
        CONSTRAINT friend_request_pair_ck CHECK (pair_low < pair_high),
        CONSTRAINT friend_request_status_ck CHECK (status IN ('PENDING','ACCEPTED','REJECTED','CANCELLED'))
      );
      CREATE UNIQUE INDEX friend_requests_pending_pair_uq ON friend_requests(pair_low, pair_high)
        WHERE status = 'PENDING';
      CREATE INDEX friend_requests_recipient_idx ON friend_requests(recipient_id, status, created_at DESC);

      CREATE TABLE friendships (
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        contact_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        remark varchar(100), created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY(user_id, contact_user_id),
        CONSTRAINT friendships_self_ck CHECK (user_id <> contact_user_id)
      );
      CREATE INDEX friendships_contact_idx ON friendships(contact_user_id);

      CREATE TABLE blocks (
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        blocked_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY(user_id, blocked_user_id),
        CONSTRAINT blocks_self_ck CHECK (user_id <> blocked_user_id)
      );

      CREATE TABLE reports (
        id uuid PRIMARY KEY, reporter_id uuid NOT NULL REFERENCES users(id),
        target_user_id uuid NOT NULL REFERENCES users(id), category varchar(32) NOT NULL,
        description varchar(1000) NOT NULL, status varchar(16) NOT NULL DEFAULT 'OPEN',
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT reports_self_ck CHECK (reporter_id <> target_user_id)
      );
      CREATE INDEX reports_target_status_idx ON reports(target_user_id, status, created_at DESC);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE reports;
      DROP TABLE blocks;
      DROP TABLE friendships;
      DROP TABLE friend_requests;
      DROP TABLE auth_login_attempts;
      DROP TABLE auth_challenges;
      DROP TABLE auth_refresh_tokens;
      DROP TABLE auth_sessions;
      DROP TABLE devices;
      DROP TABLE user_privacy_settings;
      DROP TABLE user_credentials;
      DROP TABLE users;
    `);
  }
}
