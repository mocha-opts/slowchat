import { Injectable, Inject } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { UploadSession } from "@im/contracts/api";
import { DataSource } from "typeorm";

import { AppError } from "../../../common/errors/app-error.js";
import type { AuthContext } from "../../auth/auth.types.js";
import { AuthSessionService } from "../../auth/services/auth-session.service.js";
import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
} from "../../../platform/storage/object-storage.port.js";
import { AttachmentEntity } from "../persistence/entities/attachment.entity.js";
import { UploadSessionEntity } from "../persistence/entities/upload-session.entity.js";
import { toUploadSession } from "../media.mapper.js";

@Injectable()
export class UploadQueryService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly sessions: AuthSessionService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {}

  async get(auth: AuthContext, uploadId: string): Promise<UploadSession> {
    await this.sessions.validate(auth);
    const session = await this.dataSource
      .getRepository(UploadSessionEntity)
      .findOneBy({ id: uploadId, ownerId: auth.userId });
    if (!session) throw new AppError("UPLOAD_NOT_FOUND", "Upload session was not found", 404);
    const attachment = await this.dataSource
      .getRepository(AttachmentEntity)
      .findOneByOrFail({ id: session.attachmentId });
    if (session.status === "OPEN" && session.expiresAt.getTime() <= Date.now()) {
      session.status = "EXPIRED";
      attachment.status = "DELETED";
      await this.dataSource.getRepository(UploadSessionEntity).save(session);
      await this.dataSource.getRepository(AttachmentEntity).save(attachment);
    }
    const uploadUrl =
      session.status === "OPEN"
        ? await this.storage.createPresignedPutUrl(session.objectKey)
        : null;
    return toUploadSession(session, attachment, uploadUrl);
  }
}
