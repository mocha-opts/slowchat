import { z } from "zod";

import type { AppConfig, ProcessKind } from "./app-config.js";

const booleanFromString = z.enum(["true", "false"]).transform((value) => value === "true");

const port = z.coerce.number().int().min(1).max(65_535);
const urlWithProtocols = (...protocols: string[]) =>
  z.url().refine((value) => protocols.includes(new URL(value).protocol), {
    message: `URL protocol must be one of: ${protocols.join(", ")}`,
  });

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  SHUTDOWN_GRACE_MS: z.coerce.number().int().min(1_000).max(120_000).default(15_000),
  API_PORT: port.default(3_000),
  REALTIME_PORT: port.default(3_001),
  EVENT_WORKER_PORT: port.default(3_002),
  JOB_WORKER_PORT: port.default(3_003),
  DATABASE_URL: urlWithProtocols("postgres:", "postgresql:"),
  REDIS_REALTIME_URL: urlWithProtocols("redis:", "rediss:"),
  REDIS_REALTIME_PREFIX: z.string().min(1).default("im:realtime:"),
  REDIS_JOBS_URL: urlWithProtocols("redis:", "rediss:"),
  REDIS_JOBS_PREFIX: z.string().min(1).default("im:jobs:"),
  RABBITMQ_URL: urlWithProtocols("amqp:", "amqps:"),
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(8),
  S3_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
  S3_FORCE_PATH_STYLE: booleanFromString.default(true),
  S3_AUTO_CREATE_BUCKET: booleanFromString.default(false),
});

const weakProductionValues = ["password", "dev_password", "changeme", "minioadmin"];

export function loadAppConfig(
  serviceName: ProcessKind,
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const parsed = environmentSchema.parse(environment);

  if (parsed.NODE_ENV === "production") {
    const secrets = [
      parsed.DATABASE_URL,
      parsed.REDIS_REALTIME_URL,
      parsed.REDIS_JOBS_URL,
      parsed.RABBITMQ_URL,
      parsed.S3_SECRET_KEY,
    ];
    if (
      secrets.some((secret) =>
        weakProductionValues.some((weak) => secret.toLowerCase().includes(weak)),
      )
    ) {
      throw new Error("Production configuration contains a known weak credential");
    }
  }

  return {
    nodeEnv: parsed.NODE_ENV,
    serviceName,
    logLevel: parsed.LOG_LEVEL,
    shutdownGraceMs: parsed.SHUTDOWN_GRACE_MS,
    ports: {
      api: parsed.API_PORT,
      realtime: parsed.REALTIME_PORT,
      "event-worker": parsed.EVENT_WORKER_PORT,
      "job-worker": parsed.JOB_WORKER_PORT,
    },
    databaseUrl: parsed.DATABASE_URL,
    redis: {
      realtimeUrl: parsed.REDIS_REALTIME_URL,
      realtimePrefix: parsed.REDIS_REALTIME_PREFIX,
      jobsUrl: parsed.REDIS_JOBS_URL,
      jobsPrefix: parsed.REDIS_JOBS_PREFIX,
    },
    rabbitMqUrl: parsed.RABBITMQ_URL,
    s3: {
      endpoint: parsed.S3_ENDPOINT,
      region: parsed.S3_REGION,
      accessKey: parsed.S3_ACCESS_KEY,
      secretKey: parsed.S3_SECRET_KEY,
      bucket: parsed.S3_BUCKET,
      forcePathStyle: parsed.S3_FORCE_PATH_STYLE,
      autoCreateBucket: parsed.S3_AUTO_CREATE_BUCKET,
    },
  };
}
