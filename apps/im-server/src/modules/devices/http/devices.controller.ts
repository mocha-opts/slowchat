import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Req,
  UseGuards,
} from "@nestjs/common";
import { uuidSchema } from "@im/contracts/api";

import { parseContract } from "../../../common/contracts/parse-contract.js";
import { AccessTokenGuard, type AuthenticatedRequest } from "../../auth/http/access-token.guard.js";
import { DeviceService } from "../services/device.service.js";

@Controller("api/v1/devices")
@UseGuards(AccessTokenGuard)
export class DevicesController {
  constructor(private readonly devices: DeviceService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.devices.listDevices(request.auth.userId).then((items) => ({ items }));
  }

  @Delete(":deviceId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param("deviceId") deviceId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.devices.removeDevice(request.auth, parseContract(uuidSchema, deviceId));
  }
}

@Controller("api/v1/auth/sessions")
@UseGuards(AccessTokenGuard)
export class SessionsController {
  constructor(private readonly devices: DeviceService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.devices.listSessions(request.auth.userId).then((items) => ({ items }));
  }

  @Delete(":sessionId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param("sessionId") sessionId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.devices.removeSession(request.auth, parseContract(uuidSchema, sessionId));
  }
}
