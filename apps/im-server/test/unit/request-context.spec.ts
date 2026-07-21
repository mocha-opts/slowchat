import { describe, expect, it } from "vitest";

import {
  resolveRequestId,
  resolveTraceId,
} from "../../src/platform/request-context/request-context.middleware.js";
import { RequestContextService } from "../../src/platform/request-context/request-context.service.js";

describe("request context", () => {
  it("keeps a valid request id and replaces an invalid one", () => {
    expect(resolveRequestId("client-request_1")).toBe("client-request_1");
    expect(resolveRequestId("contains spaces")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("extracts a W3C trace id", () => {
    expect(resolveTraceId("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")).toBe(
      "4bf92f3577b34da6a3ce929d0e0e4736",
    );
    expect(resolveTraceId(undefined)).toMatch(/^[0-9a-f]{32}$/);
  });

  it("keeps request and trace ids isolated by async context", () => {
    const context = new RequestContextService();
    context.run({ requestId: "request-1", traceId: "trace-1" }, () => {
      expect(context.get()).toEqual({ requestId: "request-1", traceId: "trace-1" });
    });
    expect(context.get()).toBeUndefined();
  });
});
