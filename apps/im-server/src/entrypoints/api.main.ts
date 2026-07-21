import "reflect-metadata";

import { ApiAppModule } from "../compositions/api-app.module.js";
import { bootstrapProcess } from "./bootstrap.js";

await bootstrapProcess(ApiAppModule, "api");
