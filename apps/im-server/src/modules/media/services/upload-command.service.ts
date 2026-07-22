import { randomUUID } from "node:crypto";
import { Injectable, Inject } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { CreateUploadRequest, UploadSession } from "@im/contracts/api";
import { DataSource } from "typeorm";
import { PinoLogger } from "nestjs-pino";
import { v7 as uuidv7 } from "uuid";

import { AppError } from "../../../common/errors/app-error.js";
import type { AuthContext } from "../../auth/auth.types.js";
import { AuthSessionService } from "../../auth/services/auth-session.service.js";
import { APP_CONFIG, type AppConfig } from "../../../platform/config/app-config.js";
import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
} from "../../../platform/storage/object-storage.port.js";
import { AttachmentEntity } from "../persistence/entities/attachment.entity.js";
import { UploadSessionEntity } from "../persistence/entities/upload-session.entity.js";
import { toUploadSession } from "../media.mapper.js";
import { MediaQueueService } from "../media-queue.service.js";

@Injectable()
export class UploadCommandService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly sessions: AuthSessionService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly queue: MediaQueueService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UploadCommandService.name);
  }

  async create(auth: AuthContext, input: CreateUploadRequest): Promise<UploadSession> {
    await this.sessions.validate(auth);
    const max =
      input.kind === "IMAGE" ? this.config.media.maxImageBytes : this.config.media.maxFileBytes;
    if (input.sizeBytes > max)
      throw new AppError(
        "ATTACHMENT_VALIDATION_FAILED",
        "File size exceeds the configured limit",
        400,
      );
    if (input.kind === "IMAGE" && !input.contentType.startsWith("image/"))
      throw new AppError("ATTACHMENT_VALIDATION_FAILED", "Image content type is required", 400);
    const id = uuidv7();
    const uploadId = uuidv7();
    const expiresAt = new Date(Date.now() + this.config.media.uploadTtlSeconds * 1000);
    // Object Key 不采用客户端文件名，防止路径穿越、覆盖和敏感信息泄漏。
    const objectKey = `uploads/${auth.userId}/${id}/${randomUUID()}`;
    const attachment = await this.dataSource.getRepository(AttachmentEntity).save({
      id,
      ownerId: auth.userId,
      kind: input.kind,
      objectKey,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      checksumSha256: input.checksumSha256 ?? null,
      status: "UPLOADING",
      metadata: {},
      readyAt: null,
      expiresAt,
      failureReason: null,
    });
    const session = await this.dataSource.getRepository(UploadSessionEntity).save({
      id: uploadId,
      ownerId: auth.userId,
      attachmentId: id,
      status: "OPEN",
      kind: input.kind,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      checksumSha256: input.checksumSha256 ?? null,
      objectKey,
      expiresAt,
      completedAt: null,
    });
    const uploadUrl = await this.storage.createPresignedPutUrl(objectKey);
    // 清理 Job 是最佳努力；Jobs Redis 短暂故障不能撤销已经保存的上传元数据。
    void this.queue
      .enqueueExpiration(uploadId, this.config.media.uploadTtlSeconds * 1000)
      .catch((error: unknown) =>
        this.logger.warn({ err: error, uploadId }, "Upload cleanup job enqueue failed"),
      );
    return toUploadSession(session, attachment, uploadUrl);
  }

  async cancel(auth: AuthContext, uploadId: string): Promise<void> {
    await this.sessions.validate(auth);
    const session = await this.dataSource
      .getRepository(UploadSessionEntity)
      .findOneBy({ id: uploadId, ownerId: auth.userId });
    if (!session) throw new AppError("UPLOAD_NOT_FOUND", "Upload session was not found", 404);
    if (session.status === "COMPLETED")
      throw new AppError("UPLOAD_STATE_INVALID", "Completed upload cannot be cancelled", 409);
    session.status = "CANCELLED";
    await this.dataSource.getRepository(UploadSessionEntity).save(session);
    await this.dataSource
      .getRepository(AttachmentEntity)
      .update({ id: session.attachmentId }, { status: "DELETED" });
    await this.storage.deleteObject(session.objectKey).catch(() => undefined);
  }
}
