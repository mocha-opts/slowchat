import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { Worker, type Job } from "bullmq";
import { DataSource } from "typeorm";
import { v7 as uuidv7 } from "uuid";

import { PinoLogger } from "nestjs-pino";
import type { DomainEventEnvelope, MediaStatusEventData } from "@im/contracts/events";
import { APP_CONFIG, type AppConfig } from "../../../platform/config/app-config.js";
import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
} from "../../../platform/storage/object-storage.port.js";
import { AttachmentEntity } from "../persistence/entities/attachment.entity.js";
import { MediaVariantEntity } from "../persistence/entities/media-variant.entity.js";
import { UploadSessionEntity } from "../persistence/entities/upload-session.entity.js";
import { MEDIA_QUEUE_NAME } from "../media-queue.service.js";
import type { VirusScannerPort } from "../scanning/virus-scanner.port.js";
import { VIRUS_SCANNER } from "../scanning/virus-scanner.port.js";
import { OutboxWriterService } from "../../outbox/services/outbox-writer.service.js";

@Injectable()
export class MediaProcessor implements OnModuleInit, OnApplicationShutdown {
  private worker: Worker | undefined;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(VIRUS_SCANNER) private readonly scanner: VirusScannerPort,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly logger: PinoLogger,
    private readonly outbox: OutboxWriterService,
  ) {
    this.logger.setContext(MediaProcessor.name);
  }

  onModuleInit(): void {
    this.worker = new Worker(MEDIA_QUEUE_NAME, async (job) => this.process(job), {
      connection: { url: this.config.redis.jobsUrl, maxRetriesPerRequest: 1 },
      prefix: this.config.redis.jobsPrefix,
      concurrency: 4,
    });
    this.worker.on("failed", (job, error) =>
      this.logger.error({ jobId: job?.id, err: error }, "Media job failed"),
    );
  }

  private async process(job: Job): Promise<void> {
    if (job.name === "expire") {
      await this.expireUpload(job);
      return;
    }
    const data = job.data as { attachmentId?: unknown };
    if (typeof data.attachmentId !== "string") throw new Error("Media job payload is invalid");
    const attachment = await this.dataSource
      .getRepository(AttachmentEntity)
      .findOneBy({ id: data.attachmentId });
    if (!attachment || attachment.status === "READY" || attachment.status === "DELETED") return;
    if (attachment.status !== "PROCESSING") return;
    try {
      const bytes = await this.storage.readObject(attachment.objectKey);
      const scan = await this.scanner.scan({
        attachmentId: attachment.id,
        contentType: attachment.contentType,
        bytes,
      });
      if (scan === "INFECTED" || scan === "UNKNOWN") {
        const status = scan === "INFECTED" ? "QUARANTINED" : "FAILED";
        const failureReason = scan === "INFECTED" ? "virus-detected" : "scanner-unavailable";
        await this.dataSource.transaction(async (manager) => {
          const changed = await manager
            .getRepository(AttachmentEntity)
            .update({ id: attachment.id, status: "PROCESSING" }, { status, failureReason });
          // 条件更新可能返回 0（另一个 Worker 已完成），此时不能重复发状态事件。
          if (!changed.affected) return;
          await this.outbox.append(
            manager,
            mediaStatusEvent(attachment, status, {}, failureReason),
          );
        });
        return;
      }
      const metadata =
        attachment.kind === "IMAGE"
          ? await this.imageMetadata(attachment.objectKey, attachment.contentType)
          : {};
      await this.dataSource.transaction(async (manager) => {
        const current = await manager
          .getRepository(AttachmentEntity)
          .findOne({ where: { id: attachment.id }, lock: { mode: "pessimistic_write" } });
        if (!current || current.status !== "PROCESSING") return;
        current.status = "READY";
        current.readyAt = new Date();
        current.metadata = metadata;
        await manager.getRepository(AttachmentEntity).save(current);
        await manager
          .getRepository(MediaVariantEntity)
          .createQueryBuilder()
          .insert()
          .into(MediaVariantEntity)
          .values({
            id: uuidv7(),
            attachmentId: current.id,
            variantKind: "ORIGINAL",
            objectKey: current.objectKey,
            contentType: current.contentType,
            sizeBytes: current.sizeBytes,
            checksumSha256: current.checksumSha256,
            metadata: () => `'${JSON.stringify(metadata).replaceAll("'", "''")}'::jsonb`,
          })
          .orUpdate(
            ["object_key", "content_type", "size_bytes", "checksum_sha256", "metadata"],
            ["attachment_id", "variant_kind"],
          )
          .execute();
        // 状态与 Outbox 同事务提交；Event Worker 故障时仍可由 Outbox 追平通知和 Sync。
        await this.outbox.append(manager, mediaStatusEvent(current, "READY", metadata, null));
      });
    } catch (error) {
      // 达到有限重试上限后把 PROCESSING 收敛为 FAILED，避免永久卡在处理中。
      const maxAttempts = job.opts.attempts ?? 1;
      if (job.attemptsMade + 1 >= maxAttempts) {
        await this.markFailed(attachment.id, "media-processing-failed");
      }
      this.logger.warn({ err: error, attachmentId: attachment.id }, "Media processing will retry");
      throw error;
    }
  }

  private async expireUpload(job: Job): Promise<void> {
    const data = job.data as { uploadId?: unknown };
    if (typeof data.uploadId !== "string") throw new Error("Media expiration payload is invalid");
    const session = await this.dataSource
      .getRepository(UploadSessionEntity)
      .findOneBy({ id: data.uploadId });
    if (!session || !["OPEN", "EXPIRED"].includes(session.status)) return;
    if (session.status === "OPEN") {
      if (session.expiresAt.getTime() > Date.now()) return;
      await this.dataSource
        .getRepository(UploadSessionEntity)
        .update({ id: session.id, status: "OPEN" }, { status: "EXPIRED" });
      await this.dataSource
        .getRepository(AttachmentEntity)
        .update({ id: session.attachmentId, status: "UPLOADING" }, { status: "DELETED" });
    }
    // 先确认数据库状态，再幂等删除对象；删除失败会触发 Job 重试。
    await this.storage.deleteObject(session.objectKey);
  }

  private async markFailed(attachmentId: string, reason: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const attachment = await manager
        .getRepository(AttachmentEntity)
        .findOneBy({ id: attachmentId });
      if (!attachment || attachment.status !== "PROCESSING") return;
      attachment.status = "FAILED";
      attachment.failureReason = reason;
      await manager.getRepository(AttachmentEntity).save(attachment);
      await this.outbox.append(manager, mediaStatusEvent(attachment, "FAILED", {}, reason));
    });
  }

  private async imageMetadata(
    objectKey: string,
    contentType: string,
  ): Promise<Record<string, unknown>> {
    const bytes = await this.storage.readObject(objectKey);
    const prefix: number[] = [];
    for await (const chunk of bytes) {
      prefix.push(...chunk.slice(0, 32));
      if (prefix.length >= 32) break;
    }
    const valid =
      contentType === "image/png"
        ? prefix.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10"
        : contentType === "image/jpeg"
          ? prefix[0] === 255 && prefix[1] === 216
          : contentType === "image/gif"
            ? String.fromCharCode(...prefix.slice(0, 3)) === "GIF"
            : true;
    if (!valid) throw new Error("Image magic bytes are invalid");
    return { validated: true };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
  }
}

function mediaStatusEvent(
  attachment: AttachmentEntity,
  status: MediaStatusEventData["status"],
  metadata: Record<string, unknown>,
  failureReason: string | null,
): DomainEventEnvelope<MediaStatusEventData> {
  const eventType =
    status === "READY"
      ? "media.ready.v1"
      : status === "FAILED"
        ? "media.failed.v1"
        : "media.quarantined.v1";
  return {
    eventId: uuidv7(),
    eventType,
    eventVersion: 1,
    occurredAt: new Date().toISOString(),
    aggregateType: "attachment",
    aggregateId: attachment.id,
    actorUserId: attachment.ownerId,
    audienceUserIds: [attachment.ownerId],
    data: {
      attachmentId: attachment.id,
      ownerId: attachment.ownerId,
      kind: attachment.kind as MediaStatusEventData["kind"],
      status,
      metadata,
      failureReason,
    },
  };
}
