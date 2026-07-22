import type { MigrationInterface, QueryRunner } from "typeorm";

/** P5 群资料和成员流转表；成员本身仍复用 P3 conversation_members。 */
export class CreateGroups1784822400000 implements MigrationInterface {
  name = "CreateGroups1784822400000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE group_profiles (
        conversation_id uuid PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
        title varchar(128) NOT NULL,
        announcement varchar(2000),
        max_members integer NOT NULL DEFAULT 500,
        join_mode varchar(16) NOT NULL DEFAULT 'INVITE_ONLY',
        allow_member_invites boolean NOT NULL DEFAULT false,
        all_members_muted boolean NOT NULL DEFAULT false,
        version integer NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT group_profiles_max_members_ck CHECK (max_members BETWEEN 2 AND 2000),
        CONSTRAINT group_profiles_join_mode_ck CHECK (join_mode IN ('INVITE_ONLY','REQUEST','OPEN'))
      );
      CREATE TABLE group_join_requests (
        id uuid PRIMARY KEY,
        conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status varchar(16) NOT NULL DEFAULT 'PENDING',
        message varchar(200),
        reviewer_id uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT group_join_requests_status_ck CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED'))
      );
      CREATE UNIQUE INDEX group_join_requests_pending_uq
        ON group_join_requests(conversation_id, user_id) WHERE status = 'PENDING';
      CREATE INDEX group_join_requests_conversation_idx
        ON group_join_requests(conversation_id, status, created_at DESC);
      CREATE TABLE group_invites (
        id uuid PRIMARY KEY,
        conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        inviter_id uuid NOT NULL REFERENCES users(id),
        invitee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status varchar(16) NOT NULL DEFAULT 'PENDING',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT group_invites_status_ck CHECK (status IN ('PENDING','ACCEPTED','REJECTED','CANCELLED'))
      );
      CREATE UNIQUE INDEX group_invites_pending_uq
        ON group_invites(conversation_id, invitee_id) WHERE status = 'PENDING';
      CREATE INDEX group_invites_invitee_idx ON group_invites(invitee_id, status, created_at DESC);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS group_invites_invitee_idx;
      DROP INDEX IF EXISTS group_invites_pending_uq;
      DROP TABLE IF EXISTS group_invites;
      DROP INDEX IF EXISTS group_join_requests_conversation_idx;
      DROP INDEX IF EXISTS group_join_requests_pending_uq;
      DROP TABLE IF EXISTS group_join_requests;
      DROP TABLE IF EXISTS group_profiles;
    `);
  }
}
