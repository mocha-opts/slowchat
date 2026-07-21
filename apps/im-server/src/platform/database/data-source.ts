import "reflect-metadata";

import { DataSource } from "typeorm";

import { loadEnvironmentFile } from "../config/environment-file.js";
import { createDatabaseOptions } from "./database-options.js";

loadEnvironmentFile();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for migration commands");
}

export default new DataSource(createDatabaseOptions(databaseUrl));
