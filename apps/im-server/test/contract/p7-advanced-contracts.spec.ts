import {
  addReactionRequestSchema,
  forwardMessageRequestSchema,
  messageSearchQuerySchema,
} from "@im/contracts/api";
import { errorCodeSchema } from "@im/contracts/errors";
import {
  messageSchema,
  messageReactionSchema,
  sendMessageRequestSchema,
} from "@im/contracts/messages";
import { describe, expect, it } from "vitest";

const ids = {
  user: "019b0000-0000-7000-8000-000000000001",
  device: "019b0000-0000-7000-8000-000000000002",
  conversation: "019b0000-0000-7000-8000-000000000003",
  message: "019b0000-0000-7000-8000-000000000004",
};

describe("P7 advanced message contracts", () => {
  it("accepts reply and forward references without changing contentVersion", () => {
    const request = sendMessageRequestSchema.parse({
      clientMessageId: ids.message,
      type: "TEXT",
      contentVersion: 1,
      payload: { text: "reply" },
      replyToMessageId: ids.message,
      forwardFromMessageId: ids.message,
    });
    expect(request.contentVersion).toBe(1);
    expect(
      forwardMessageRequestSchema.parse({
        clientMessageId: ids.message,
        conversationId: ids.conversation,
      }),
    ).toEqual({
      clientMessageId: ids.message,
      conversationId: ids.conversation,
    });
  });

  it("validates reaction and search cursor inputs", () => {
    expect(addReactionRequestSchema.parse({ reaction: "👍" }).reaction).toBe("👍");
    expect(messageReactionSchema.safeParse({}).success).toBe(false);
    expect(messageSearchQuerySchema.parse({ q: "hello" }).limit).toBe(20);
    expect(
      messageSchema.safeParse({
        id: ids.message,
        conversationId: ids.conversation,
        seq: 1,
        senderId: ids.user,
        senderDeviceId: ids.device,
        clientMessageId: ids.message,
        type: "TEXT",
        contentVersion: 1,
        payload: { text: "hello" },
        textPreview: "hello",
        countsUnread: true,
        recalledAt: null,
        createdAt: new Date().toISOString(),
      }).success,
    ).toBe(true);
  });

  it("publishes stable P7 error codes", () => {
    for (const code of [
      "MESSAGE_RECALL_WINDOW_EXPIRED",
      "MESSAGE_ALREADY_RECALLED",
      "MESSAGE_ALREADY_HIDDEN",
      "REACTION_INVALID",
      "REACTION_CONFLICT",
      "REACTION_NOT_FOUND",
      "SEARCH_QUERY_INVALID",
    ]) {
      expect(errorCodeSchema.safeParse(code).success).toBe(true);
    }
  });
});
