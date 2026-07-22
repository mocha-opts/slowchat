import { describe, expect, it, vi } from "vitest";

import { directConversationKey } from "../../src/modules/conversations/services/conversation-command.service.js";
import { messageContentHash } from "../../src/modules/messages/services/message-command.service.js";
import { outboxRetryDelay } from "../../src/modules/outbox/services/outbox-relay.service.js";

describe("P3 messaging invariants", () => {
  it("builds the same direct key regardless of participant order", () => {
    const alice = "019b0000-0000-7000-8000-000000000001";
    const bob = "019b0000-0000-7000-8000-000000000002";
    expect(directConversationKey(alice, bob)).toBe(`${alice}:${bob}`);
    expect(directConversationKey(bob, alice)).toBe(`${alice}:${bob}`);
  });

  it("fingerprints the conversation and exact message content", () => {
    const input = {
      clientMessageId: "019b0000-0000-7000-8000-000000000003",
      type: "TEXT" as const,
      contentVersion: 1 as const,
      payload: { text: "hello" },
    };
    const first = messageContentHash("019b0000-0000-7000-8000-000000000001", input);
    expect(messageContentHash("019b0000-0000-7000-8000-000000000001", input)).toBe(first);
    expect(messageContentHash("019b0000-0000-7000-8000-000000000002", input)).not.toBe(first);
    expect(
      messageContentHash("019b0000-0000-7000-8000-000000000001", {
        ...input,
        payload: { text: "different" },
      }),
    ).not.toBe(first);
  });

  it("caps exponential outbox retry and adds bounded jitter", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    expect(outboxRetryDelay(1, 500, 60_000)).toBe(550);
    expect(outboxRetryDelay(20, 500, 60_000)).toBe(60_000);
  });
});
