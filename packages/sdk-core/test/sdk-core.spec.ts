import { describe, expect, it, vi } from "vitest";

import { MemoryStorage, SyncCoordinator, TokenManager, type TokenProvider } from "../src/index.js";

describe("SDK core", () => {
  it("serializes refresh-token rotation", async () => {
    const provider: TokenProvider = {
      get: vi.fn(),
      refresh: vi.fn(async () => ({ accessToken: "next", refreshToken: "next-r", expiresAt: 2 })),
      clear: vi.fn(async () => undefined),
    };
    const storage = new MemoryStorage();
    const manager = new TokenManager(provider, storage);
    await manager.save({ accessToken: "old", refreshToken: "old-r", expiresAt: 1 });
    await Promise.all([manager.refresh(), manager.refresh()]);
    expect(provider.refresh).toHaveBeenCalledTimes(1);
  });

  it("deduplicates events and persists the cursor after applying them", async () => {
    const storage = new MemoryStorage();
    const applied: number[] = [];
    const coordinator = new SyncCoordinator(
      storage,
      { apply: async (event) => applied.push(event.id) },
      "device-1",
    );
    const event = {
      id: 1,
      eventId: "00000000-0000-7000-8000-000000000001",
      userId: "00000000-0000-7000-8000-000000000002",
      eventType: "message.created.v1" as const,
      eventVersion: 1 as const,
      entityType: "message",
      entityId: "00000000-0000-7000-8000-000000000003",
      conversationId: null,
      seq: null,
      payload: {},
      createdAt: new Date().toISOString(),
    };
    const response = {
      userSyncCursor: 1,
      hasMore: false,
      events: [event, event],
      missingRanges: [],
      serverTimestamp: Date.now(),
    };
    await coordinator.applyResponse(response);
    expect(applied).toEqual([1]);
    expect(await coordinator.cursor()).toBe(1);
  });
});
