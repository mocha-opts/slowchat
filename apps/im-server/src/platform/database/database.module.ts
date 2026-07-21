import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { APP_CONFIG, type AppConfig } from "../config/app-config.js";
import { createDatabaseOptions } from "./database-options.js";

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        ...createDatabaseOptions(config.databaseUrl),
        retryAttempts: 5,
        retryDelay: 1_000,
      }),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
