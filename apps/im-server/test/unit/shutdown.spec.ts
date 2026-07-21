import { afterEach, describe, expect, it, vi } from "vitest";

import { runWithinShutdownGrace } from "../../src/entrypoints/bootstrap.js";

describe("graceful shutdown deadline", () => {
  afterEach(() => vi.useRealTimers());

  it("rejects work that exceeds the configured grace period", async () => {
    vi.useFakeTimers();
    const shutdown = runWithinShutdownGrace(() => new Promise(() => undefined), 15_000);
    const assertion = expect(shutdown).rejects.toThrow("Shutdown exceeded 15000ms");

    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
  });
});
