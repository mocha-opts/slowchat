import { Module } from "@nestjs/common";

import { MediaPersistenceModule } from "./persistence/media-persistence.module.js";
import { RedisModule } from "../../platform/redis/redis.module.js";
import { StorageModule } from "../../platform/storage/storage.module.js";
import { DatabaseModule } from "../../platform/database/database.module.js";
import { PlatformConfigModule } from "../../platform/config/platform-config.module.js";
import { PlatformLoggerModule } from "../../platform/logger/platform-logger.module.js";
import { MediaProcessor } from "./services/media-processor.service.js";
import { DeterministicVirusScannerService } from "./scanning/deterministic-virus-scanner.service.js";
import { VIRUS_SCANNER } from "./scanning/virus-scanner.port.js";
import { OutboxWriterModule } from "../outbox/outbox-writer.module.js";

@Module({
  imports: [
    MediaPersistenceModule,
    RedisModule.forJobs(),
    StorageModule,
    DatabaseModule,
    PlatformConfigModule.forProcess("job-worker"),
    PlatformLoggerModule,
    OutboxWriterModule,
  ],
  providers: [
    MediaProcessor,
    DeterministicVirusScannerService,
    { provide: VIRUS_SCANNER, useExisting: DeterministicVirusScannerService },
  ],
})
export class MediaWorkerModule {}
