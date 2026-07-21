import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { DataSource } from "typeorm";

import { PROCESS_KIND, type ProcessKind } from "../config/app-config.js";
import { RabbitMqService } from "../rabbitmq/rabbitmq.service.js";
import { ManagedRedis } from "../redis/managed-redis.js";
import { REDIS_JOBS, REDIS_REALTIME } from "../redis/redis.tokens.js";
import { OBJECT_STORAGE, type ObjectStoragePort } from "../storage/object-storage.port.js";
import type { DependencyStatus, HealthResponse } from "./health.types.js";

const processChecks: Record<ProcessKind, readonly string[]> = {
  api: ["postgres", "redisRealtime", "objectStorage"],
  realtime: ["postgres", "redisRealtime"],
  "event-worker": ["postgres", "redisRealtime", "rabbitMq"],
  "job-worker": ["postgres", "redisJobs", "objectStorage"],
};

@Injectable()
export class HealthService implements OnApplicationShutdown {
  private acceptingTraffic = true;

  constructor(
    @Inject(PROCESS_KIND) private readonly processKind: ProcessKind,
    private readonly dataSource: DataSource,
    private readonly moduleRef: ModuleRef,
  ) {}

  liveness(): HealthResponse {
    return this.response("ok", {});
  }

  markNotReady(): void {
    this.acceptingTraffic = false;
  }

  async readiness(): Promise<HealthResponse> {
    const entries = await Promise.all(
      processChecks[this.processKind].map(async (name) => [name, await this.check(name)] as const),
    );
    const checks = Object.fromEntries(entries);
    const ready = this.acceptingTraffic && Object.values(checks).every((status) => status === "up");
    return this.response(ready ? "ok" : "error", checks);
  }

  onApplicationShutdown(): void {
    this.markNotReady();
  }

  private async check(name: string): Promise<DependencyStatus> {
    try {
      switch (name) {
        case "postgres":
          await this.dataSource.query("SELECT 1");
          return "up";
        case "redisRealtime":
          return (await this.get<ManagedRedis>(REDIS_REALTIME).ping()) ? "up" : "down";
        case "redisJobs":
          return (await this.get<ManagedRedis>(REDIS_JOBS).ping()) ? "up" : "down";
        case "rabbitMq":
          return this.get<RabbitMqService>(RabbitMqService).isReady() ? "up" : "down";
        case "objectStorage":
          return (await this.get<ObjectStoragePort>(OBJECT_STORAGE).isReady()) ? "up" : "down";
        default:
          return "down";
      }
    } catch {
      return "down";
    }
  }

  private get<T>(token: symbol | (new (...args: never[]) => T)): T {
    return this.moduleRef.get<T>(token, { strict: false });
  }

  private response(
    status: "ok" | "error",
    checks: Record<string, DependencyStatus>,
  ): HealthResponse {
    return {
      status,
      service: this.processKind,
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}
