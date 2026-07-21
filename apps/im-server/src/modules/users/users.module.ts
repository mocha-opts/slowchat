import { Module } from "@nestjs/common";

import { AuthApplicationModule } from "../auth/auth-application.module.js";
import { PrivacySettingsController } from "./http/privacy-settings.controller.js";
import { UsersController } from "./http/users.controller.js";
import { UserService } from "./services/user.service.js";

@Module({
  imports: [AuthApplicationModule],
  controllers: [UsersController, PrivacySettingsController],
  providers: [UserService],
  exports: [UserService],
})
export class UsersModule {}
