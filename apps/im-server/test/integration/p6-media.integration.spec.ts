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

describe("P6 media persistence", () => {
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
      ],
    });
    await dataSource.initialize();
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      for (let index = 0; index < 5; index += 1) await dataSource.undoLastMigration();
      await dataSource.destroy();
    }
    if (postgres) await postgres.stop();
  });

  it("creates media tables and enforces variant idempotency", async () => {
    expect(await dataSource.query("SELECT to_regclass('attachments') AS name")).toEqual([
      { name: "attachments" },
    ]);
    const user = "019b0000-0000-7000-8000-000000000001";
    const attachment = "019b0000-0000-7000-8000-000000000002";
    await dataSource.query(
      `INSERT INTO users(id, username, username_normalized, nickname) VALUES ($1, 'media-user', 'media-user', 'Media')`,
      [user],
    );
    await dataSource.query(
      `INSERT INTO attachments(id, owner_id, kind, object_key, file_name, content_type, size_bytes, status)
       VALUES ($1, $2, 'FILE', 'uploads/media/object', 'a.txt', 'text/plain', 1, 'READY')`,
      [attachment, user],
    );
    await dataSource.query(
      `INSERT INTO media_variants(id, attachment_id, variant_kind, object_key, content_type, size_bytes)
       VALUES ('019b0000-0000-7000-8000-000000000003', $1, 'ORIGINAL', 'uploads/media/object', 'text/plain', 1)`,
      [attachment],
    );
    await expect(
      dataSource.query(
        `INSERT INTO media_variants(id, attachment_id, variant_kind, object_key, content_type, size_bytes)
         VALUES ('019b0000-0000-7000-8000-000000000004', $1, 'ORIGINAL', 'uploads/media/duplicate', 'text/plain', 1)`,
        [attachment],
      ),
    ).rejects.toThrow();
  });
});
