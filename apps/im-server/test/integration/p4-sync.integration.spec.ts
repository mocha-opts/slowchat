import "reflect-metadata";

import { GenericContainer, Wait, type StartedTestContainer } from "@im/test-utils";
import { DataSource } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabaseOptions } from "../../src/platform/database/database-options.js";
import { CreateAuthUsersContacts1784563200000 } from "../../src/platform/database/migrations/202607210001-create-auth-users-contacts.js";
import { CreateConversationsMessagesOutbox1784649600000 } from "../../src/platform/database/migrations/202607220001-create-conversations-messages-outbox.js";
import { CreateSyncProjection1784736000000 } from "../../src/platform/database/migrations/202607230001-create-sync-projection.js";

describe("P4 sync persistence", () => {
  let postgres: StartedTestContainer;
  let dataSource: DataSource;
  const user = "019b0000-0000-7000-8000-000000000001";
  const device = "019b0000-0000-7000-8000-000000000002";

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
      ],
    });
    await dataSource.initialize();
    await dataSource.runMigrations();
    await dataSource.query(
      `INSERT INTO users(id, username, username_normalized, nickname, status, user_type, extensions, version)
       VALUES ($1, 'sync-user', 'sync-user', 'Sync User', 'ACTIVE', 'USER', '{}', 1)`,
      [user],
    );
    await dataSource.query(
      `INSERT INTO devices(id, user_id, client_device_id, platform, name, app_version, status, last_seen_at)
       VALUES ($1, $2, 'sync-client', 'WEB', 'Browser', '1.0', 'ACTIVE', now())`,
      [device, user],
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.undoLastMigration();
      await dataSource.undoLastMigration();
      await dataSource.undoLastMigration();
      await dataSource.destroy();
    }
    if (postgres) await postgres.stop();
  });

  it("creates the sync schema and isolates device cursors", async () => {
    expect(await dataSource.query("SELECT to_regclass('user_sync_events') AS name")).toEqual([
      { name: "user_sync_events" },
    ]);
    await dataSource.query(
      `INSERT INTO device_sync_states(user_id, device_id, last_sync_event_id)
       VALUES ($1, $2, 3)`,
      [user, device],
    );
    await dataSource.query(
      `INSERT INTO user_sync_events(user_id, event_id, event_type, event_version, payload)
       VALUES ($1, '019b0000-0000-7000-8000-000000000003', 'message.created.v1', 1, '{}')`,
      [user],
    );
    await expect(
      dataSource.query(
        `INSERT INTO user_sync_events(user_id, event_id, event_type, event_version, payload)
         VALUES ($1, '019b0000-0000-7000-8000-000000000003', 'message.created.v1', 1, '{}')`,
        [user],
      ),
    ).rejects.toThrow();
    expect(
      await dataSource.query(
        "SELECT last_sync_event_id FROM device_sync_states WHERE device_id = $1",
        [device],
      ),
    ).toEqual([{ last_sync_event_id: "3" }]);
  });
});
