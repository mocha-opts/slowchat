import { Module } from "@nestjs/common";

import { AuthValidationModule } from "./auth-validation.module.js";
import { AuthController } from "./http/auth.controller.js";
import { AUTH_NOTIFICATION_PORT } from "./notifications/auth-notification.port.js";
import { CaptureAuthNotificationService } from "./notifications/capture-auth-notification.service.js";
import { AuthCommandService } from "./services/auth-command.service.js";
import { AuthRateLimiterService } from "./services/auth-rate-limiter.service.js";
import { IdentityNormalizerService } from "./services/identity-normalizer.service.js";
import { PasswordService } from "./services/password.service.js";

@Module({
  imports: [AuthValidationModule],
  controllers: [AuthController],
  providers: [
    AuthCommandService,
    AuthRateLimiterService,
    IdentityNormalizerService,
    PasswordService,
    CaptureAuthNotificationService,
    { provide: AUTH_NOTIFICATION_PORT, useExisting: CaptureAuthNotificationService },
  ],
  exports: [AuthValidationModule, AuthCommandService, PasswordService],
})
export class AuthApplicationModule {}
