import { describe, expect, it } from "vitest";

import { loadAppConfig } from "../../src/platform/config/config-loader.js";

function validEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    DATABASE_URL: "postgresql://im:secret@localhost:5432/im",
    REDIS_REALTIME_URL: "redis://user:secret@localhost:6379/0",
    REDIS_JOBS_URL: "redis://user:secret@localhost:6380/0",
    RABBITMQ_URL: "amqp://user:secret@localhost:5672/im",
    JWT_PRIVATE_KEY_PATH: "/tmp/test-private.pem",
    JWT_PUBLIC_KEY_PATH: "/tmp/test-public.pem",
    AUTH_REFRESH_TOKEN_PEPPER: "test-refresh-token-pepper-32-bytes-minimum",
    AUTH_CHALLENGE_PEPPER: "test-challenge-pepper-32-bytes-minimum-value",
    AUTH_IDENTIFIER_PEPPER: "test-identifier-pepper-32-bytes-minimum",
    S3_ENDPOINT: "http://localhost:9000",
    S3_ACCESS_KEY: "access",
    S3_SECRET_KEY: "secret-key",
    S3_BUCKET: "im-test",
    S3_FORCE_PATH_STYLE: "true",
    S3_AUTO_CREATE_BUCKET: "false",
    ...overrides,
  };
}

describe("loadAppConfig", () => {
  it("creates a typed process configuration", () => {
    const config = loadAppConfig("api", validEnvironment());

    expect(config.serviceName).toBe("api");
    expect(config.ports.api).toBe(3000);
    expect(config.s3.forcePathStyle).toBe(true);
    expect(config.s3.autoCreateBucket).toBe(false);
    expect(config.messaging.rabbitMqRetryDelaysMs).toEqual([5_000, 30_000, 300_000]);
  });

  it("fails fast when a required connection is missing", () => {
    const environment = validEnvironment();
    delete environment.DATABASE_URL;

    expect(() => loadAppConfig("api", environment)).toThrow();
  });

  it("rejects known weak credentials in production", () => {
    expect(() =>
      loadAppConfig(
        "api",
        validEnvironment({
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://im:dev_password@db:5432/im",
        }),
      ),
    ).toThrow("known weak credential");
  });

  it("rejects invalid messaging retry configuration", () => {
    expect(() =>
      loadAppConfig("event-worker", validEnvironment({ RABBITMQ_RETRY_DELAYS_MS: "0,nope" })),
    ).toThrow("RABBITMQ_RETRY_DELAYS_MS");
    expect(() =>
      loadAppConfig(
        "event-worker",
        validEnvironment({ OUTBOX_RETRY_BASE_MS: "2000", OUTBOX_RETRY_MAX_MS: "1000" }),
      ),
    ).toThrow("OUTBOX_RETRY_BASE_MS");
  });
});
