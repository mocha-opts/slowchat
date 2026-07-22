import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { CompleteUploadResponse } from "@im/contracts/api";
import { DataSource } from "typeorm";

import { AppError } from "../../../common/errors/app-error.js";
import { APP_CONFIG, type AppConfig } from "../../../platform/config/app-config.js";
import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
} from "../../../platform/storage/object-storage.port.js";
import type { AuthContext } from "../../auth/auth.types.js";
import { AuthSessionService } from "../../auth/services/auth-session.service.js";
import { AttachmentEntity } from "../persistence/entities/attachment.entity.js";
import { UploadSessionEntity } from "../persistence/entities/upload-session.entity.js";
import { toAttachment } from "../media.mapper.js";
import { MediaQueueService } from "../media-queue.service.js";

@Injectable()
export class AttachmentCommandService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly sessions: AuthSessionService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly queue: MediaQueueService,
  ) {}

  async complete(auth: AuthContext, uploadId: string): Promise<CompleteUploadResponse> {
    await this.sessions.validate(auth);
    const result = await this.dataSource.transaction(async (manager) => {
      const session = await manager.getRepository(UploadSessionEntity).findOne({
        where: { id: uploadId, ownerId: auth.userId },
        lock: { mode: "pessimistic_write" },
      });
      if (!session) throw new AppError("UPLOAD_NOT_FOUND", "Upload session was not found", 404);
      const attachment = await manager
        .getRepository(AttachmentEntity)
        .findOneByOrFail({ id: session.attachmentId });
      if (["PROCESSING", "READY", "FAILED", "QUARANTINED"].includes(attachment.status)) {
        return { session, attachment, duplicate: true };
      }
      if (session.expiresAt.getTime() <= Date.now()) {
        session.status = "EXPIRED";
        attachment.status = "DELETED";
        await manager.getRepository(UploadSessionEntity).save(session);
        await manager.getRepository(AttachmentEntity).save(attachment);
        throw new AppError("UPLOAD_EXPIRED", "Upload session has expired", 410);
      }
      if (session.status !== "OPEN" || attachment.status !== "UPLOADING")
        throw new AppError("UPLOAD_STATE_INVALID", "Upload session cannot be completed", 409);
      let head;
      try {
        head = await this.storage.headObject(session.objectKey);
        if (
          head.sizeBytes !== session.sizeBytes ||
          (head.contentType && head.contentType.toLowerCase() !== session.contentType.toLowerCase())
        ) {
          throw new Error("object metadata does not match the upload declaration");
        }
        // 客户端可以直接覆盖 Presigned PUT 对象，因此 Complete 必须再次读取并验证内容。
        await this.validateObject(session.contentType, session.checksumSha256, session.objectKey);
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(
          "ATTACHMENT_VALIDATION_FAILED",
          "Uploaded object failed server validation",
          400,
        );
      }
      session.status = "COMPLETED";
      session.completedAt = new Date();
      attachment.status = "PROCESSING";
      await manager.getRepository(UploadSessionEntity).save(session);
      await manager.getRepository(AttachmentEntity).save(attachment);
      return { session, attachment, duplicate: false };
    });
    if (!result.duplicate) await this.queue.enqueue(result.attachment.id);
    return {
      uploadId: result.session.id,
      attachment: toAttachment(result.attachment),
      status: result.attachment.status as CompleteUploadResponse["status"],
      duplicate: result.duplicate,
    };
  }

  private async validateObject(
    contentType: string,
    checksumSha256: string | null,
    objectKey: string,
  ): Promise<void> {
    const needsMagic = ["image/png", "image/jpeg", "image/gif"].includes(contentType.toLowerCase());
    if (!needsMagic && !checksumSha256) return;
    const stream = await this.storage.readObject(objectKey);
    const hash = checksumSha256 ? createHash("sha256") : null;
    const prefix: number[] = [];
    for await (const chunk of stream) {
      const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      if (hash) hash.update(bytes);
      if (prefix.length < 32) prefix.push(...bytes.slice(0, 32 - prefix.length));
      // 没有 checksum 时只需读取足够的 Magic Bytes，避免 Complete 为大文件重复传输。
      if (!hash && prefix.length >= 32) break;
    }
    if (hash && hash.digest("hex") !== checksumSha256?.toLowerCase()) {
      throw new Error("checksum does not match");
    }
    const valid =
      contentType.toLowerCase() === "image/png"
        ? prefix.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10"
        : contentType.toLowerCase() === "image/jpeg"
          ? prefix[0] === 255 && prefix[1] === 216
          : contentType.toLowerCase() === "image/gif"
            ? String.fromCharCode(...prefix.slice(0, 3)) === "GIF"
            : true;
    if (!valid) throw new Error("image magic bytes are invalid");
  }

  async expire(uploadId: string): Promise<void> {
    const session = await this.dataSource
      .getRepository(UploadSessionEntity)
      .findOneBy({ id: uploadId });
    if (!session || session.status !== "OPEN" || session.expiresAt.getTime() > Date.now()) return;
    await this.dataSource
      .getRepository(UploadSessionEntity)
      .update({ id: uploadId, status: "OPEN" }, { status: "EXPIRED" });
    await this.dataSource
      .getRepository(AttachmentEntity)
      .update({ id: session.attachmentId }, { status: "DELETED" });
    await this.storage.deleteObject(session.objectKey).catch(() => undefined);
  }
}
