import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AttachmentEntity } from "./entities/attachment.entity.js";
import { MediaVariantEntity } from "./entities/media-variant.entity.js";
import { UploadSessionEntity } from "./entities/upload-session.entity.js";

export const MEDIA_ENTITIES = [UploadSessionEntity, AttachmentEntity, MediaVariantEntity];

@Module({
  imports: [TypeOrmModule.forFeature(MEDIA_ENTITIES)],
  exports: [TypeOrmModule],
})
export class MediaPersistenceModule {}
