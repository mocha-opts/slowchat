import { Module } from "@nestjs/common";

import { OBJECT_STORAGE } from "./object-storage.port.js";
import { S3ObjectStorageService } from "./s3-object-storage.service.js";

@Module({
  providers: [
    S3ObjectStorageService,
    { provide: OBJECT_STORAGE, useExisting: S3ObjectStorageService },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
