import { Controller, Get, Res } from "@nestjs/common";
import type { Response } from "express";

import { HealthService } from "./health.service.js";
import type { HealthResponse } from "./health.types.js";

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get("live")
  liveness(): HealthResponse {
    return this.healthService.liveness();
  }

  @Get("ready")
  async readiness(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    const health = await this.healthService.readiness();
    if (health.status === "error") response.status(503);
    return health;
  }
}
