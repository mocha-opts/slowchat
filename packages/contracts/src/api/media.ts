import { z } from "zod";

import { paginationQuerySchema, uuidSchema } from "./common.js";

export const mediaKindSchema = z.enum(["IMAGE", "FILE"]);
export type MediaKind = z.infer<typeof mediaKindSchema>;
export const uploadSessionStatusSchema = z.enum(["OPEN", "COMPLETED", "EXPIRED", "CANCELLED"]);
export type UploadSessionStatus = z.infer<typeof uploadSessionStatusSchema>;
export const attachmentStatusSchema = z.enum([
  "UPLOADING",
  "UPLOADED",
  "PROCESSING",
  "READY",
  "FAILED",
  "QUARANTINED",
  "DELETED",
]);
export type AttachmentStatus = z.infer<typeof attachmentStatusSchema>;

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const fileNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((value) => !/[\\/\0]/.test(value));

export const createUploadRequestSchema = z
  .object({
    kind: mediaKindSchema,
    fileName: fileNameSchema,
    contentType: z.string().trim().min(1).max(127),
    sizeBytes: z.number().int().positive().safe(),
    checksumSha256: sha256Schema.optional(),
  })
  .strict();
export type CreateUploadRequest = z.infer<typeof createUploadRequestSchema>;

export const attachmentSchema = z.object({
  id: uuidSchema,
  ownerId: uuidSchema,
  kind: mediaKindSchema,
  fileName: fileNameSchema,
  contentType: z.string(),
  sizeBytes: z.number().int().positive().safe(),
  checksumSha256: sha256Schema.nullable(),
  status: attachmentStatusSchema,
  metadata: z.record(z.string(), z.unknown()),
  readyAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const uploadSessionSchema = z.object({
  id: uuidSchema,
  attachmentId: uuidSchema,
  status: uploadSessionStatusSchema,
  /** 仅用于排障和客户端比对，绝不返回可直接访问对象的完整 Key。 */
  objectKeyDigest: sha256Schema,
  uploadUrl: z.url().nullable(),
  expiresAt: z.iso.datetime(),
  attachment: attachmentSchema,
});
export type UploadSession = z.infer<typeof uploadSessionSchema>;

export const completeUploadResponseSchema = z.object({
  uploadId: uuidSchema,
  attachment: attachmentSchema,
  status: z.enum(["PROCESSING", "READY", "FAILED", "QUARANTINED"]),
  duplicate: z.boolean(),
});
export type CompleteUploadResponse = z.infer<typeof completeUploadResponseSchema>;

export const attachmentDownloadSchema = z.object({
  attachmentId: uuidSchema,
  downloadUrl: z.url(),
  expiresAt: z.iso.datetime(),
});
export type AttachmentDownload = z.infer<typeof attachmentDownloadSchema>;

export const uploadListQuerySchema = paginationQuerySchema;
