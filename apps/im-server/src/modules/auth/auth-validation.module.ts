import { Module } from "@nestjs/common";

import { AccessTokenGuard } from "./http/access-token.guard.js";
import { AuthSessionService } from "./services/auth-session.service.js";
import { TokenService } from "./services/token.service.js";

@Module({
  providers: [TokenService, AuthSessionService, AccessTokenGuard],
  exports: [TokenService, AuthSessionService, AccessTokenGuard],
})
export class AuthValidationModule {}
