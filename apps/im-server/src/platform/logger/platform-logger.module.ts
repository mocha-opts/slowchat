import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";

import { APP_CONFIG, type AppConfig } from "../config/app-config.js";
import { resolveRequestId, resolveTraceId } from "../request-context/request-context.middleware.js";

export const LOGGER_REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.body.password",
  "req.body.token",
  "req.body.accessToken",
  "req.body.refreshToken",
  "req.body.apiSecret",
  "req.body.presignedUrl",
  "res.headers.set-cookie",
];

type CorrelatedRequest = {
  readonly headers: Record<string, string | string[] | undefined>;
  traceId?: string;
};

function requestTraceId(request: CorrelatedRequest): string {
  request.traceId ??= resolveTraceId(request.headers.traceparent);
  return request.traceId;
}

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          autoLogging: config.nodeEnv !== "test",
          customLogLevel: (_request, response, error) =>
            error || response.statusCode >= 500 ? "warn" : "info",
          customProps: (request) => ({
            service: config.serviceName,
            traceId: requestTraceId(request),
          }),
          genReqId: (request, response) => {
            const requestId = resolveRequestId(request.headers["x-request-id"]);
            response.setHeader("X-Request-Id", requestId);
            return requestId;
          },
          level: config.logLevel,
          redact: {
            censor: "[REDACTED]",
            paths: LOGGER_REDACT_PATHS,
          },
        },
      }),
    }),
  ],
  exports: [LoggerModule],
})
export class PlatformLoggerModule {}
