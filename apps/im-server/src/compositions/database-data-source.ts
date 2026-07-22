import "reflect-metadata";

import { DataSource } from "typeorm";

import { IDENTITY_ENTITIES } from "../modules/identity-persistence.module.js";
import { MESSAGING_ENTITIES } from "../modules/messaging-persistence/messaging-persistence.module.js";
import { loadEnvironmentFile } from "../platform/config/environment-file.js";
import { createDatabaseOptions } from "../platform/database/database-options.js";
import { CreateAuthUsersContacts1784563200000 } from "../platform/database/migrations/202607210001-create-auth-users-contacts.js";
import { CreateConversationsMessagesOutbox1784649600000 } from "../platform/database/migrations/202607220001-create-conversations-messages-outbox.js";

loadEnvironmentFile();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for migration commands");

export default new DataSource({
  ...createDatabaseOptions(databaseUrl),
  entities: [...IDENTITY_ENTITIES, ...MESSAGING_ENTITIES],
  migrations: [
    CreateAuthUsersContacts1784563200000,
    CreateConversationsMessagesOutbox1784649600000,
  ],
});
