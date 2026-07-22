import {
  attachmentSchema,
  completeUploadResponseSchema,
  createUploadRequestSchema,
  uploadSessionSchema,
} from "@im/contracts/api";
import { errorCodeSchema } from "@im/contracts/errors";
import { mediaReadyEventSchema } from "@im/contracts/events";
import {
  imagePayloadSchema,
  messageSchema,
  sendMessageRequestSchema,
} from "@im/contracts/messages";
import { describe, expect, it } from "vitest";

const ids = {
  user: "019b0000-0000-7000-8000-000000000001",
  attachment: "019b0000-0000-7000-8000-000000000002",
  upload: "019b0000-0000-7000-8000-000000000003",
  conversation: "019b0000-0000-7000-8000-000000000004",
  message: "019b0000-0000-7000-8000-000000000005",
  device: "019b0000-0000-7000-8000-000000000006",
};

describe("P6 media contracts", () => {
  it("validates upload and attachment state envelopes", () => {
    const input = createUploadRequestSchema.parse({
      kind: "IMAGE",
      fileName: "photo.png",
      contentType: "image/png",
      sizeBytes: 8,
    });
    expect(input.kind).toBe("IMAGE");
    const attachment = attachmentSchema.parse({
      id: ids.attachment,
      ownerId: ids.user,
      kind: "IMAGE",
      fileName: "photo.png",
      contentType: "image/png",
      sizeBytes: 8,
      checksumSha256: null,
      status: "READY",
      metadata: { validated: true },
      readyAt: new Date().toISOString(),
      expiresAt: null,
      createdAt: new Date().toISOString(),
    });
    expect(
      uploadSessionSchema.parse({
        id: ids.upload,
        attachmentId: attachment.id,
        status: "OPEN",
        objectKeyDigest: "a".repeat(64),
        uploadUrl: "https://minio.example/upload",
        expiresAt: new Date().toISOString(),
        attachment,
      }).attachment.status,
    ).toBe("READY");
    expect(completeUploadResponseSchema.safeParse({}).success).toBe(false);
  });

  it("supports IMAGE/FILE message payloads without changing content version", () => {
    const request = sendMessageRequestSchema.parse({
      clientMessageId: ids.message,
      type: "IMAGE",
      contentVersion: 1,
      payload: { attachmentId: ids.attachment, width: 1, height: 1 },
    });
    expect(request.type).toBe("IMAGE");
    expect(imagePayloadSchema.safeParse({ attachmentId: ids.attachment }).success).toBe(true);
    expect(
      messageSchema.safeParse({
        id: ids.message,
        conversationId: ids.conversation,
        seq: 1,
        senderId: ids.user,
        senderDeviceId: ids.device,
        clientMessageId: ids.message,
        type: "IMAGE",
        contentVersion: 1,
        payload: { attachmentId: ids.attachment },
        textPreview: "IMAGE",
        countsUnread: true,
        createdAt: new Date().toISOString(),
      }).success,
    ).toBe(true);
  });

  it("publishes stable media error codes", () => {
    for (const code of [
      "UPLOAD_NOT_FOUND",
      "UPLOAD_EXPIRED",
      "UPLOAD_STATE_INVALID",
      "ATTACHMENT_NOT_FOUND",
      "ATTACHMENT_FORBIDDEN",
      "ATTACHMENT_NOT_READY",
      "ATTACHMENT_VALIDATION_FAILED",
      "ATTACHMENT_QUARANTINED",
    ])
      expect(errorCodeSchema.safeParse(code).success).toBe(true);
  });

  it("does not put storage credentials in media status events", () => {
    const event = mediaReadyEventSchema.parse({
      eventId: ids.message,
      eventType: "media.ready.v1",
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      aggregateType: "attachment",
      aggregateId: ids.attachment,
      actorUserId: ids.user,
      audienceUserIds: [ids.user],
      data: {
        attachmentId: ids.attachment,
        ownerId: ids.user,
        kind: "IMAGE",
        status: "READY",
        metadata: { validated: true },
        failureReason: null,
      },
    });
    expect(JSON.stringify(event)).not.toContain("objectKey");
    expect(JSON.stringify(event)).not.toContain("Presigned");
  });
});
