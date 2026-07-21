import "reflect-metadata";

import { EventWorkerAppModule } from "../compositions/event-worker-app.module.js";
import { bootstrapProcess } from "./bootstrap.js";

await bootstrapProcess(EventWorkerAppModule, "event-worker");
