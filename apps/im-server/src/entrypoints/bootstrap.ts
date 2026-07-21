import type { INestApplication, Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";

import { APP_CONFIG, type AppConfig, type ProcessKind } from "../platform/config/app-config.js";
import { loadEnvironmentFile } from "../platform/config/environment-file.js";
import { HealthService } from "../platform/health/health.service.js";
import { RequestContextMiddleware } from "../platform/request-context/request-context.middleware.js";

export interface BootstrapOptions {
  readonly configure?: (app: INestApplication) => Promise<(() => Promise<void>) | undefined>;
}

export async function bootstrapProcess(
  rootModule: Type<unknown>,
  processKind: ProcessKind,
  options: BootstrapOptions = {},
): Promise<INestApplication> {
  loadEnvironmentFile();
  const app = await NestFactory.create(rootModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const requestContext = app.get(RequestContextMiddleware);
  app.use(requestContext.use.bind(requestContext));

  const cleanup = await options.configure?.(app);
  const config = app.get<AppConfig>(APP_CONFIG);
  const port = config.ports[processKind];
  installTerminationHandlers(app, config.shutdownGraceMs, cleanup);
  await app.listen(port, "0.0.0.0");
  return app;
}

function installTerminationHandlers(
  app: INestApplication,
  graceMs: number,
  cleanup?: () => Promise<void>,
): void {
  let closing = false;
  const close = async (signal: NodeJS.Signals): Promise<void> => {
    if (closing) return;
    closing = true;
    try {
      await runWithinShutdownGrace(async () => {
        app.get(HealthService).markNotReady();
        await cleanup?.();
        await app.close();
      }, graceMs);
      process.exitCode = 0;
    } catch (error) {
      console.error({ error, signal }, "Graceful shutdown failed");
      process.exitCode = 1;
    }
  };

  process.once("SIGINT", () => void close("SIGINT"));
  process.once("SIGTERM", () => void close("SIGTERM"));
}

export async function runWithinShutdownGrace(
  work: () => Promise<void>,
  graceMs: number,
): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Shutdown exceeded ${graceMs}ms`)), graceMs);
    timer.unref();
  });
  try {
    await Promise.race([work(), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
