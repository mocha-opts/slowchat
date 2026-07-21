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
  JWT_ISSUER: z.string().min(1).default("slowchat"),
  JWT_AUDIENCE: z.string().min(1).default("slowchat-clients"),
  JWT_KEY_ID: z.string().min(1).default("default-rs256"),
  JWT_PRIVATE_KEY_PATH: z.string().min(1).optional(),
  JWT_PUBLIC_KEY_PATH: z.string().min(1).optional(),
  AUTH_REFRESH_TOKEN_PEPPER: z.string().min(32),
  AUTH_CHALLENGE_PEPPER: z.string().min(32),
  AUTH_IDENTIFIER_PEPPER: z.string().min(32),
  AUTH_MAX_DEVICES: z.coerce.number().int().min(1).max(10).default(5),
  AUTH_CHALLENGE_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
  AUTH_CHALLENGE_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  AUTH_CHALLENGE_RESEND_SECONDS: z.coerce.number().int().min(1).max(3600).default(60),
  AUTH_LOGIN_IDENTITY_LIMIT: z.coerce.number().int().min(1).max(100).default(5),
  AUTH_LOGIN_IP_LIMIT: z.coerce.number().int().min(1).max(1000).default(20),
  AUTH_LOGIN_WINDOW_SECONDS: z.coerce.number().int().min(60).max(86400).default(900),
  AUTH_EXPOSE_CHALLENGE_CODE: booleanFromString.default(false),
  AUTH_ALLOWED_WS_ORIGINS: z.string().default("http://localhost:3000"),
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
      parsed.AUTH_REFRESH_TOKEN_PEPPER,
      parsed.AUTH_CHALLENGE_PEPPER,
      parsed.AUTH_IDENTIFIER_PEPPER,
    ];
    if (
      secrets.some((secret) =>
        weakProductionValues.some((weak) => secret.toLowerCase().includes(weak)),
      )
    ) {
      throw new Error("Production configuration contains a known weak credential");
    }
    if (parsed.AUTH_EXPOSE_CHALLENGE_CODE) {
      throw new Error("Production configuration cannot expose authentication challenge codes");
    }
    if (
      parsed.JWT_PRIVATE_KEY_PATH?.includes(".local") ||
      parsed.JWT_PUBLIC_KEY_PATH?.includes(".local")
    ) {
      throw new Error("Production configuration cannot use development JWT keys");
    }
  }

  if (serviceName === "api" && !parsed.JWT_PRIVATE_KEY_PATH) {
    throw new Error("JWT_PRIVATE_KEY_PATH is required for the API process");
  }
  if ((serviceName === "api" || serviceName === "realtime") && !parsed.JWT_PUBLIC_KEY_PATH) {
    throw new Error("JWT_PUBLIC_KEY_PATH is required for API and Realtime processes");
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
    auth: {
      jwtIssuer: parsed.JWT_ISSUER,
      jwtAudience: parsed.JWT_AUDIENCE,
      jwtKeyId: parsed.JWT_KEY_ID,
      ...(parsed.JWT_PRIVATE_KEY_PATH ? { jwtPrivateKeyPath: parsed.JWT_PRIVATE_KEY_PATH } : {}),
      ...(parsed.JWT_PUBLIC_KEY_PATH ? { jwtPublicKeyPath: parsed.JWT_PUBLIC_KEY_PATH } : {}),
      refreshTokenPepper: parsed.AUTH_REFRESH_TOKEN_PEPPER,
      challengePepper: parsed.AUTH_CHALLENGE_PEPPER,
      identifierPepper: parsed.AUTH_IDENTIFIER_PEPPER,
      maxDevices: parsed.AUTH_MAX_DEVICES,
      challengeTtlSeconds: parsed.AUTH_CHALLENGE_TTL_SECONDS,
      challengeMaxAttempts: parsed.AUTH_CHALLENGE_MAX_ATTEMPTS,
      challengeResendSeconds: parsed.AUTH_CHALLENGE_RESEND_SECONDS,
      loginIdentityLimit: parsed.AUTH_LOGIN_IDENTITY_LIMIT,
      loginIpLimit: parsed.AUTH_LOGIN_IP_LIMIT,
      loginWindowSeconds: parsed.AUTH_LOGIN_WINDOW_SECONDS,
      exposeChallengeCode: parsed.AUTH_EXPOSE_CHALLENGE_CODE,
      allowedWsOrigins: parsed.AUTH_ALLOWED_WS_ORIGINS.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    },
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
