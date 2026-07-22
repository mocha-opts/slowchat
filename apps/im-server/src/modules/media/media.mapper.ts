import { createHash } from "node:crypto";
import type { Attachment, UploadSession } from "@im/contracts/api";

import type { AttachmentEntity } from "./persistence/entities/attachment.entity.js";
import type { UploadSessionEntity } from "./persistence/entities/upload-session.entity.js";

export function toAttachment(value: AttachmentEntity): Attachment {
  return {
    id: value.id,
    ownerId: value.ownerId,
    kind: value.kind as Attachment["kind"],
    fileName: value.fileName,
    contentType: value.contentType,
    sizeBytes: value.sizeBytes,
    checksumSha256: value.checksumSha256,
    status: value.status as Attachment["status"],
    metadata: value.metadata ?? {},
    readyAt: value.readyAt?.toISOString() ?? null,
    expiresAt: value.expiresAt?.toISOString() ?? null,
    createdAt: value.createdAt.toISOString(),
  };
}

export function toUploadSession(
  value: UploadSessionEntity,
  attachment: AttachmentEntity,
  uploadUrl: string | null,
): UploadSession {
  return {
    id: value.id,
    attachmentId: value.attachmentId,
    status: value.status as UploadSession["status"],
    objectKeyDigest: createHash("sha256").update(value.objectKey).digest("hex"),
    uploadUrl,
    expiresAt: value.expiresAt.toISOString(),
    attachment: toAttachment(attachment),
  };
}
