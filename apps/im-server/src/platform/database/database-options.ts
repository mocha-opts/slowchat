import type { DataSourceOptions } from "typeorm";

export function createDatabaseOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: "postgres",
    url: databaseUrl,
    synchronize: false,
    migrationsRun: false,
    migrationsTableName: "typeorm_migrations",
    migrationsTransactionMode: "all",
    entities: [new URL("../../modules/**/*.entity.{js,ts}", import.meta.url).pathname],
    migrations: [new URL("./migrations/*.{js,ts}", import.meta.url).pathname],
    extra: {
      max: 20,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
    },
  };
}
