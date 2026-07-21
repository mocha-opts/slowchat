import { HttpStatus, type ArgumentsHost } from "@nestjs/common";
import type { PinoLogger } from "nestjs-pino";
import { describe, expect, it, vi } from "vitest";

import { ApiExceptionFilter } from "../../src/common/errors/api-exception.filter.js";
import { AppError } from "../../src/common/errors/app-error.js";
import { RequestContextService } from "../../src/platform/request-context/request-context.service.js";

describe("ApiExceptionFilter", () => {
  it("serializes a stable application error envelope", () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const response = { getHeader: () => undefined, status };
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ path: "/api/v1/example" }),
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
    const requestContext = new RequestContextService();
    const logError = vi.fn();
    const logger = { error: logError } as unknown as PinoLogger;
    const filter = new ApiExceptionFilter(requestContext, logger);

    requestContext.run({ requestId: "request-1", traceId: "trace-1" }, () => {
      filter.catch(
        new AppError(
          "SERVICE_UNAVAILABLE",
          "Dependency unavailable",
          HttpStatus.SERVICE_UNAVAILABLE,
        ),
        host,
      );
    });

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "request-1",
        code: "SERVICE_UNAVAILABLE",
        message: "Dependency unavailable",
      }),
    );
    expect(logError).toHaveBeenCalledOnce();
  });
});
