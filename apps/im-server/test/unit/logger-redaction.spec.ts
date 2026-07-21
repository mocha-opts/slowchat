import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";

import { LOGGER_REDACT_PATHS } from "../../src/platform/logger/platform-logger.module.js";

describe("logger redaction", () => {
  it("redacts credentials and presigned URLs", () => {
    let output = "";
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
        callback();
      },
    });
    const logger = pino(
      { redact: { censor: "[REDACTED]", paths: LOGGER_REDACT_PATHS } },
      destination,
    );

    logger.info({
      req: {
        body: { password: "password-value", presignedUrl: "https://secret.example/put" },
        headers: { authorization: "Bearer secret", cookie: "session=secret" },
      },
    });

    expect(output).not.toContain("password-value");
    expect(output).not.toContain("Bearer secret");
    expect(output).not.toContain("session=secret");
    expect(output).not.toContain("https://secret.example/put");
    expect(output).toContain("[REDACTED]");
  });
});
