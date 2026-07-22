import "reflect-metadata";

import { GenericContainer, Wait, type StartedTestContainer } from "@im/test-utils";
import { DataSource } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabaseOptions } from "../../src/platform/database/database-options.js";
import { CreateAuthUsersContacts1784563200000 } from "../../src/platform/database/migrations/202607210001-create-auth-users-contacts.js";
import { CreateConversationsMessagesOutbox1784649600000 } from "../../src/platform/database/migrations/202607220001-create-conversations-messages-outbox.js";
import { CreateSyncProjection1784736000000 } from "../../src/platform/database/migrations/202607230001-create-sync-projection.js";
import { CreateGroups1784822400000 } from "../../src/platform/database/migrations/202607240001-create-groups.js";
import { CreateMedia1784908800000 } from "../../src/platform/database/migrations/202607250001-create-media.js";
import { CreateAdvancedMessages1784995200000 } from "../../src/platform/database/migrations/202607260001-create-advanced-messages.js";

describe("P7 advanced message persistence", () => {
  let postgres: StartedTestContainer;
  let dataSource: DataSource;

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
        CreateMedia1784908800000,
        CreateAdvancedMessages1784995200000,
      ],
    });
    await dataSource.initialize();
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      for (let index = 0; index < 6; index += 1) await dataSource.undoLastMigration();
      await dataSource.destroy();
    }
    if (postgres) await postgres.stop();
  });

  it("creates reaction and per-user hide tables with database idempotency", async () => {
    expect(await dataSource.query("SELECT to_regclass('message_reactions') AS name")).toEqual([
      { name: "message_reactions" },
    ]);
    const user = "019b0000-0000-7000-8000-000000000001";
    const message = "019b0000-0000-7000-8000-000000000002";
    const conversation = "019b0000-0000-7000-8000-000000000003";
    const device = "019b0000-0000-7000-8000-000000000005";
    const reaction = "019b0000-0000-7000-8000-000000000004";
    await dataSource.query(
      `INSERT INTO users(id, username, username_normalized, nickname) VALUES ($1, 'p7-user', 'p7-user', 'P7')`,
      [user],
    );
    await dataSource.query(
      `INSERT INTO conversations(id, type, creator_id, direct_key, member_count)
       VALUES ($1, 'DIRECT', $2, 'p7-direct', 1)`,
      [conversation, user],
    );
    await dataSource.query(
      `INSERT INTO devices(
         id, user_id, client_device_id, platform, name, last_seen_at
       ) VALUES ($1, $2, 'p7-device', 'WEB', 'P7', now())`,
      [device, user],
    );
    await dataSource.query(
      `INSERT INTO conversation_members(conversation_id, user_id, role, status)
       VALUES ($1, $2, 'OWNER', 'ACTIVE')`,
      [conversation, user],
    );
    await dataSource.query(
      `INSERT INTO conversation_user_states(conversation_id, user_id)
       VALUES ($1, $2)`,
      [conversation, user],
    );
    await dataSource.query(
      `INSERT INTO messages(
         id, conversation_id, seq, sender_id, sender_device_id, client_message_id,
         content_hash, type, content_version, payload, text_preview
       ) VALUES ($1, $2, 1, $3, $4, $5, repeat('a', 64), 'TEXT', 1, '{"text":"p7"}', 'p7')`,
      [message, conversation, user, device, "019b0000-0000-7000-8000-000000000006"],
    );
    await dataSource.query(
      `INSERT INTO message_reactions(id, message_id, user_id, reaction)
       VALUES ($1, $2, $3, '👍')`,
      [reaction, message, user],
    );
    await expect(
      dataSource.query(
        `INSERT INTO message_reactions(id, message_id, user_id, reaction)
         VALUES ($1, $2, $3, '👍')`,
        ["019b0000-0000-7000-8000-000000000007", message, user],
      ),
    ).rejects.toThrow();
    await dataSource.query(`INSERT INTO message_user_hides(user_id, message_id) VALUES ($1, $2)`, [
      user,
      message,
    ]);
    await expect(
      dataSource.query(`INSERT INTO message_user_hides(user_id, message_id) VALUES ($1, $2)`, [
        user,
        message,
      ]),
    ).rejects.toThrow();
    expect(await dataSource.query("SELECT count(*)::int AS count FROM message_user_hides")).toEqual(
      [{ count: 1 }],
    );
  });
});
