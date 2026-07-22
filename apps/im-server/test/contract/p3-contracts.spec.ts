import {
  conversationListResponseSchema,
  createDirectConversationRequestSchema,
  messageHistoryResponseSchema,
  updateConversationSettingsRequestSchema,
} from "@im/contracts/api";
import { p3DomainEventSchema } from "@im/contracts/events";
import { errorCodeSchema } from "@im/contracts/errors";
import { messageAcceptedSchema, sendTextMessageRequestSchema } from "@im/contracts/messages";
import {
  conversationReadCommandSchema,
  messageDeliveredCommandSchema,
  messageSendCommandSchema,
  wsAckSchema,
} from "@im/contracts/websocket";
import { describe, expect, it } from "vitest";

const ids = {
  user: "019b0000-0000-7000-8000-000000000001",
  peer: "019b0000-0000-7000-8000-000000000002",
  device: "019b0000-0000-7000-8000-000000000003",
  conversation: "019b0000-0000-7000-8000-000000000004",
  message: "019b0000-0000-7000-8000-000000000005",
  event: "019b0000-0000-7000-8000-000000000006",
  clientMessage: "019b0000-0000-7000-8000-000000000007",
};

describe("P3 contracts", () => {
  it("accepts strict direct and settings requests", () => {
    expect(createDirectConversationRequestSchema.parse({ userId: ids.peer })).toEqual({
      userId: ids.peer,
    });
    expect(updateConversationSettingsRequestSchema.safeParse({}).success).toBe(false);
    expect(
      updateConversationSettingsRequestSchema.safeParse({ muted: true, extra: true }).success,
    ).toBe(false);
  });

  it("enforces non-empty text and the 8 KiB UTF-8 limit", () => {
    const base = {
      clientMessageId: ids.clientMessage,
      type: "TEXT",
      contentVersion: 1,
    } as const;
    expect(
      sendTextMessageRequestSchema.safeParse({ ...base, payload: { text: "hello" } }).success,
    ).toBe(true);
    expect(sendTextMessageRequestSchema.safeParse({ ...base, payload: { text: "" } }).success).toBe(
      false,
    );
    expect(
      sendTextMessageRequestSchema.safeParse({ ...base, payload: { text: "你".repeat(2731) } })
        .success,
    ).toBe(false);
    expect(
      sendTextMessageRequestSchema.safeParse({
        ...base,
        type: "IMAGE",
        payload: { text: "unsupported" },
      }).success,
    ).toBe(false);
  });

  it("requires event names and authenticated device IDs to match command schemas", () => {
    const send = command("message.send", {
      conversationId: ids.conversation,
      clientMessageId: ids.clientMessage,
      type: "TEXT",
      contentVersion: 1,
      payload: { text: "hello" },
    });
    expect(messageSendCommandSchema.safeParse(send).success).toBe(true);
    expect(
      messageSendCommandSchema.safeParse({ ...send, event: "conversation.read" }).success,
    ).toBe(false);
    expect(
      messageDeliveredCommandSchema.safeParse(
        command("message.delivered", {
          conversationId: ids.conversation,
          lastDeliveredSeq: 3,
        }),
      ).success,
    ).toBe(true);
    expect(
      conversationReadCommandSchema.safeParse(
        command("conversation.read", { conversationId: ids.conversation, lastReadSeq: 3 }),
      ).success,
    ).toBe(true);
  });

  it("serializes message ACKs, list responses and versioned events", () => {
    const accepted = {
      status: "ACCEPTED",
      messageId: ids.message,
      conversationId: ids.conversation,
      seq: 1,
      duplicate: false,
      serverTimestamp: Date.now(),
    } as const;
    expect(messageAcceptedSchema.parse(accepted).status).toBe("ACCEPTED");
    expect(
      wsAckSchema.safeParse({
        requestId: "req-1",
        ok: true,
        code: "OK",
        data: accepted,
        serverTimestamp: Date.now(),
      }).success,
    ).toBe(true);
    expect(
      conversationListResponseSchema.parse({ items: [], nextCursor: null, hasMore: false }),
    ).toEqual({ items: [], nextCursor: null, hasMore: false });
    expect(
      messageHistoryResponseSchema.parse({ items: [], nextBeforeSeq: null, hasMore: false }),
    ).toEqual({ items: [], nextBeforeSeq: null, hasMore: false });
    expect(p3DomainEventSchema.safeParse(messageEvent()).success).toBe(true);
    expect(p3DomainEventSchema.safeParse({ ...messageEvent(), eventVersion: 2 }).success).toBe(
      false,
    );
  });

  it("publishes all P3 stable error codes", () => {
    for (const code of [
      "CONVERSATION_NOT_FOUND",
      "CONVERSATION_FORBIDDEN",
      "CONVERSATION_CONFLICT",
      "MESSAGE_NOT_FOUND",
      "MESSAGE_FORBIDDEN",
      "MESSAGE_TYPE_UNSUPPORTED",
      "MESSAGE_PAYLOAD_INVALID",
      "MESSAGE_IDEMPOTENCY_CONFLICT",
      "MESSAGE_SEQ_INVALID",
      "RECEIPT_SEQ_INVALID",
    ]) {
      expect(errorCodeSchema.safeParse(code).success).toBe(true);
    }
  });
});

function command(event: string, data: unknown) {
  return {
    version: 1,
    event,
    requestId: "req-1",
    deviceId: ids.device,
    timestamp: Date.now(),
    data,
  };
}

function messageEvent() {
  return {
    eventId: ids.event,
    eventType: "message.created.v1",
    eventVersion: 1,
    occurredAt: new Date().toISOString(),
    aggregateType: "message",
    aggregateId: ids.message,
    actorUserId: ids.user,
    audienceUserIds: [ids.user, ids.peer],
    data: {
      id: ids.message,
      conversationId: ids.conversation,
      seq: 1,
      senderId: ids.user,
      senderDeviceId: ids.device,
      clientMessageId: ids.clientMessage,
      type: "TEXT",
      contentVersion: 1,
      payload: { text: "hello" },
      textPreview: "hello",
      countsUnread: true,
      createdAt: new Date().toISOString(),
    },
  };
}
