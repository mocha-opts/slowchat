import { Module } from "@nestjs/common";

import { AuthValidationModule } from "../auth/auth-validation.module.js";
import { DevicesController, SessionsController } from "./http/devices.controller.js";
import { DeviceService } from "./services/device.service.js";

@Module({
  imports: [AuthValidationModule],
  controllers: [DevicesController, SessionsController],
  providers: [DeviceService],
  exports: [DeviceService],
})
export class DevicesModule {}
