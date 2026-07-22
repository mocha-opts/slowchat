import "reflect-metadata";

import { GenericContainer, Wait, type StartedTestContainer } from "@im/test-utils";
import { DataSource } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabaseOptions } from "../../src/platform/database/database-options.js";
import { CreateAuthUsersContacts1784563200000 } from "../../src/platform/database/migrations/202607210001-create-auth-users-contacts.js";
import { CreateConversationsMessagesOutbox1784649600000 } from "../../src/platform/database/migrations/202607220001-create-conversations-messages-outbox.js";
import { CreateSyncProjection1784736000000 } from "../../src/platform/database/migrations/202607230001-create-sync-projection.js";
import { CreateGroups1784822400000 } from "../../src/platform/database/migrations/202607240001-create-groups.js";

describe("P5 group persistence", () => {
  let postgres: StartedTestContainer;
  let dataSource: DataSource;
  const owner = "019b0000-0000-7000-8000-000000000001";
  const member = "019b0000-0000-7000-8000-000000000002";
  const conversation = "019b0000-0000-7000-8000-000000000003";

  beforeAll(async () => {
    postgres = await new GenericContainer("postgres:18.3-alpine")
      .withEnvironment({ POSTGRES_DB: "im", POSTGRES_USER: "im", POSTGRES_PASSWORD: "secret" })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start();
    dataSource = new DataSource({
      ...createDatabaseOptions(
        `postgresql://im:secret@${postgres.getHost()}:${postgres.getMappedPort(5432)}/im`,
      ),
      entities: [],
      migrations: [
        CreateAuthUsersContacts1784563200000,
        CreateConversationsMessagesOutbox1784649600000,
        CreateSyncProjection1784736000000,
        CreateGroups1784822400000,
      ],
    });
    await dataSource.initialize();
    await dataSource.runMigrations();
    await dataSource.query(
      `INSERT INTO users(id, username, username_normalized, nickname)
       VALUES ($1, 'group-owner', 'group-owner', 'Owner'), ($2, 'group-member', 'group-member', 'Member')`,
      [owner, member],
    );
    await dataSource.query(
      `INSERT INTO conversations(id, type, creator_id, owner_id, title, member_count)
       VALUES ($1, 'GROUP', $2, $2, 'Group', 1)`,
      [conversation, owner],
    );
    await dataSource.query(
      `INSERT INTO conversation_members(conversation_id, user_id, role, status, joined_at)
       VALUES ($1, $2, 'OWNER', 'ACTIVE', now())`,
      [conversation, owner],
    );
    await dataSource.query(
      `INSERT INTO group_profiles(conversation_id, title) VALUES ($1, 'Group')`,
      [conversation],
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.undoLastMigration();
      await dataSource.undoLastMigration();
      await dataSource.undoLastMigration();
      await dataSource.undoLastMigration();
      await dataSource.destroy();
    }
    if (postgres) await postgres.stop();
  });

  it("creates group tables and enforces one pending request/invite", async () => {
    expect(await dataSource.query("SELECT to_regclass('group_profiles') AS name")).toEqual([
      { name: "group_profiles" },
    ]);
    const requestId = "019b0000-0000-7000-8000-000000000010";
    await dataSource.query(
      `INSERT INTO group_join_requests(id, conversation_id, user_id, message)
       VALUES ($1, $2, $3, 'please add me')`,
      [requestId, conversation, member],
    );
    await expect(
      dataSource.query(
        `INSERT INTO group_join_requests(id, conversation_id, user_id, message)
         VALUES ('019b0000-0000-7000-8000-000000000011', $1, $2, 'again')`,
        [conversation, member],
      ),
    ).rejects.toThrow();
    await dataSource.query(
      `INSERT INTO group_invites(id, conversation_id, inviter_id, invitee_id)
       VALUES ('019b0000-0000-7000-8000-000000000012', $1, $2, $3)`,
      [conversation, owner, member],
    );
    await expect(
      dataSource.query(
        `INSERT INTO group_invites(id, conversation_id, inviter_id, invitee_id)
         VALUES ('019b0000-0000-7000-8000-000000000013', $1, $2, $3)`,
        [conversation, owner, member],
      ),
    ).rejects.toThrow();
  });
});
