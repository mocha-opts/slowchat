import type { DataSourceOptions } from "typeorm";

export function createDatabaseOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: "postgres",
    url: databaseUrl,
    synchronize: false,
    migrationsRun: false,
    migrationsTableName: "typeorm_migrations",
    migrationsTransactionMode: "all",
    entities: [],
    migrations: [],
    extra: {
      max: 20,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
    },
  };
}
