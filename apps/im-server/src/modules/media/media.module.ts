import { Module } from "@nestjs/common";

import { MediaPersistenceModule } from "./persistence/media-persistence.module.js";
import { RedisModule } from "../../platform/redis/redis.module.js";
import { StorageModule } from "../../platform/storage/storage.module.js";
import { AuthValidationModule } from "../auth/auth-validation.module.js";
import { MediaQueueService } from "./media-queue.service.js";
import { AttachmentAccessService } from "./services/attachment-access.service.js";
import { AttachmentCommandService } from "./services/attachment-command.service.js";
import { UploadCommandService } from "./services/upload-command.service.js";
import { UploadQueryService } from "./services/upload-query.service.js";
import { MediaController } from "./http/media.controller.js";
import { DeterministicVirusScannerService } from "./scanning/deterministic-virus-scanner.service.js";
import { VIRUS_SCANNER } from "./scanning/virus-scanner.port.js";

@Module({
  imports: [MediaPersistenceModule, RedisModule.forJobs(), StorageModule, AuthValidationModule],
  controllers: [MediaController],
  providers: [
    UploadCommandService,
    UploadQueryService,
    AttachmentCommandService,
    AttachmentAccessService,
    MediaQueueService,
    DeterministicVirusScannerService,
    { provide: VIRUS_SCANNER, useExisting: DeterministicVirusScannerService },
  ],
  exports: [
    UploadCommandService,
    UploadQueryService,
    AttachmentCommandService,
    AttachmentAccessService,
    MediaQueueService,
  ],
})
export class MediaModule {}
