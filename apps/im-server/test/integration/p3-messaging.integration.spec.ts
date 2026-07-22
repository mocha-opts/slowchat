import "reflect-metadata";

import { GenericContainer, Wait, type StartedTestContainer } from "@im/test-utils";
import { DataSource } from "typeorm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabaseOptions } from "../../src/platform/database/database-options.js";
import { CreateAuthUsersContacts1784563200000 } from "../../src/platform/database/migrations/202607210001-create-auth-users-contacts.js";
import { CreateConversationsMessagesOutbox1784649600000 } from "../../src/platform/database/migrations/202607220001-create-conversations-messages-outbox.js";

const alice = "019b0000-0000-7000-8000-000000000001";
const bob = "019b0000-0000-7000-8000-000000000002";
const aliceDevice = "019b0000-0000-7000-8000-000000000003";
const conversation = "019b0000-0000-7000-8000-000000000004";

describe("P3 messaging persistence", () => {
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
      ],
    });
    await dataSource.initialize();
    await dataSource.runMigrations();
    await seed();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.undoLastMigration();
      await dataSource.undoLastMigration();
      await dataSource.destroy();
    }
    if (postgres) await postgres.stop();
  });

  it("creates and fully reverts the P3 schema", async () => {
    expect(await dataSource.query("SELECT to_regclass('messages') AS name")).toEqual([
      { name: "messages" },
    ]);
    expect(await dataSource.query("SELECT to_regclass('outbox_events') AS name")).toEqual([
      { name: "outbox_events" },
    ]);
  });

  it("enforces one active direct conversation per normalized pair", async () => {
    await expect(
      dataSource.query(
        `INSERT INTO conversations(id, type, direct_key, creator_id, member_count)
         VALUES ('019b0000-0000-7000-8000-000000000099', 'DIRECT', $1, $2, 2)`,
        [`${alice}:${bob}`, alice],
      ),
    ).rejects.toThrow();
  });

  it("allocates strictly increasing unique sequence numbers concurrently", async () => {
    const values = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        dataSource.transaction(async (manager) => {
          const result = await manager.query<[Array<{ last_seq: string }>, number]>(
            "UPDATE conversations SET last_seq = last_seq + 1 WHERE id = $1 RETURNING last_seq",
            [conversation],
          );
          const seq = Number(result[0][0]!.last_seq);
          await manager.query(
            `INSERT INTO messages(
               id, conversation_id, seq, sender_id, sender_device_id, client_message_id,
               content_hash, type, content_version, payload, text_preview
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'TEXT', 1, $8, $9)`,
            [
              uuidFor(index + 100),
              conversation,
              seq,
              alice,
              aliceDevice,
              uuidFor(index + 200),
              String(index).padStart(64, "0"),
              JSON.stringify({ text: `message-${index}` }),
              `message-${index}`,
            ],
          );
          return seq;
        }),
      ),
    );
    expect([...values].sort((left, right) => left - right)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    expect(
      await dataSource.query(
        "SELECT count(*)::int AS count, count(DISTINCT seq)::int AS distinct_count FROM messages",
      ),
    ).toEqual([{ count: 20, distinct_count: 20 }]);
  });

  it("rejects reused client message IDs and backward receipt constraints", async () => {
    await expect(
      dataSource.query(
        `INSERT INTO messages(
           id, conversation_id, seq, sender_id, sender_device_id, client_message_id,
           content_hash, type, content_version, payload, text_preview
         ) SELECT $1, conversation_id, 21, sender_id, sender_device_id, client_message_id,
                  content_hash, type, content_version, payload, text_preview
             FROM messages LIMIT 1`,
        [uuidFor(400)],
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `UPDATE conversation_user_states
            SET last_delivered_seq = 1, last_read_seq = 2
          WHERE conversation_id = $1 AND user_id = $2`,
        [conversation, bob],
      ),
    ).rejects.toThrow();
  });

  it("enforces stable outbox and per-consumer inbox identities", async () => {
    const eventId = uuidFor(500);
    await dataSource.query(
      `INSERT INTO outbox_events(
         event_id, event_type, event_version, routing_key, aggregate_type, aggregate_id, payload
       ) VALUES ($1, 'message.created.v1', 1, 'message.created.v1', 'message', $2, '{}')`,
      [eventId, uuidFor(100)],
    );
    await expect(
      dataSource.query(
        `INSERT INTO outbox_events(
           event_id, event_type, event_version, routing_key, aggregate_type, aggregate_id, payload
         ) VALUES ($1, 'message.created.v1', 1, 'message.created.v1', 'message', $2, '{}')`,
        [eventId, uuidFor(101)],
      ),
    ).rejects.toThrow();
    await dataSource.query(
      `INSERT INTO consumer_inbox_events(consumer_name, event_id, event_type)
       VALUES ('realtime-dispatch.v1', $1, 'message.created.v1')`,
      [eventId],
    );
    await expect(
      dataSource.query(
        `INSERT INTO consumer_inbox_events(consumer_name, event_id, event_type)
         VALUES ('realtime-dispatch.v1', $1, 'message.created.v1')`,
        [eventId],
      ),
    ).rejects.toThrow();
  });

  async function seed(): Promise<void> {
    await dataSource.query(
      `INSERT INTO users(id, username, username_normalized, nickname)
       VALUES ($1, 'alice', 'alice', 'Alice'), ($2, 'bob', 'bob', 'Bob')`,
      [alice, bob],
    );
    await dataSource.query(
      `INSERT INTO devices(id, user_id, client_device_id, platform, name, last_seen_at)
       VALUES ($1, $2, 'alice-device', 'WEB', 'Alice Device', now())`,
      [aliceDevice, alice],
    );
    await dataSource.query(
      `INSERT INTO conversations(id, type, direct_key, creator_id, member_count)
       VALUES ($1, 'DIRECT', $2, $3, 2)`,
      [conversation, `${alice}:${bob}`, alice],
    );
    await dataSource.query(
      `INSERT INTO conversation_members(conversation_id, user_id, joined_at)
       VALUES ($1, $2, now()), ($1, $3, now())`,
      [conversation, alice, bob],
    );
    await dataSource.query(
      `INSERT INTO conversation_user_states(conversation_id, user_id)
       VALUES ($1, $2), ($1, $3)`,
      [conversation, alice, bob],
    );
  }
});

function uuidFor(value: number): string {
  return `019b0000-0000-7000-8000-${String(value).padStart(12, "0")}`;
}
