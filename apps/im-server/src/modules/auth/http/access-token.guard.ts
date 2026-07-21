import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

import { AppError } from "../../../common/errors/app-error.js";
import type { AuthContext } from "../auth.types.js";
import { AuthSessionService } from "../services/auth-session.service.js";
import { TokenService } from "../services/token.service.js";

export type AuthenticatedRequest = Request & { auth: AuthContext };

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly sessions: AuthSessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      throw new AppError("UNAUTHORIZED", "Authentication is required", 401);
    }
    const auth = await this.tokens.verifyAccessToken(authorization.slice(7));
    await this.sessions.validate(auth);
    request.auth = auth;
    return true;
  }
}
