import "reflect-metadata";

import { JobWorkerAppModule } from "../compositions/job-worker-app.module.js";
import { bootstrapProcess } from "./bootstrap.js";

await bootstrapProcess(JobWorkerAppModule, "job-worker");
