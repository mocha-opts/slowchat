import {
  messageRangeQuerySchema,
  syncEventSchema,
  syncEventsQuerySchema,
  syncRequestSchema,
  syncResponseSchema,
} from "@im/contracts/api";
import { errorCodeSchema } from "@im/contracts/errors";
import { describe, expect, it } from "vitest";

const ids = {
  user: "019b0000-0000-7000-8000-000000000001",
  device: "019b0000-0000-7000-8000-000000000002",
  event: "019b0000-0000-7000-8000-000000000003",
};

describe("P4 sync contracts", () => {
  it("accepts versioned sync requests and rejects invalid device/cursor input", () => {
    expect(
      syncRequestSchema.parse({ deviceId: ids.device, userSyncCursor: 0, lastSeq: {}, limit: 50 }),
    ).toMatchObject({ deviceId: ids.device, userSyncCursor: 0 });
    expect(syncEventsQuerySchema.safeParse({ deviceId: ids.device, after: -1 }).success).toBe(
      false,
    );
    expect(syncEventsQuerySchema.safeParse({ deviceId: ids.device, limit: 101 }).success).toBe(
      false,
    );
    expect(messageRangeQuerySchema.safeParse({ afterSeq: 4, beforeSeq: 2 }).success).toBe(true);
  });

  it("requires event version 1 and validates response cursor", () => {
    const event = {
      id: 1,
      eventId: ids.event,
      userId: ids.user,
      eventType: "message.created.v1",
      eventVersion: 1,
      entityType: "message",
      entityId: ids.event,
      conversationId: null,
      seq: 1,
      payload: { messageId: ids.event },
      createdAt: new Date().toISOString(),
    };
    expect(syncEventSchema.parse(event).id).toBe(1);
    expect(syncEventSchema.safeParse({ ...event, eventVersion: 2 }).success).toBe(false);
    expect(
      syncResponseSchema.parse({
        userSyncCursor: 1,
        hasMore: false,
        events: [event],
        missingRanges: [],
        serverTimestamp: Date.now(),
      }).events,
    ).toHaveLength(1);
    expect(errorCodeSchema.parse("SYNC_CURSOR_EXPIRED")).toBe("SYNC_CURSOR_EXPIRED");
  });
});
