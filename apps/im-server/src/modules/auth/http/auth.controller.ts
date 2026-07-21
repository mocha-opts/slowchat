import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import {
  loginRequestSchema,
  logoutRequestSchema,
  passwordChangeRequestSchema,
  passwordResetChallengeRequestSchema,
  passwordResetConfirmRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
  registrationChallengeRequestSchema,
} from "@im/contracts/api";
import type { Request } from "express";

import { parseContract } from "../../../common/contracts/parse-contract.js";
import { AuthCommandService } from "../services/auth-command.service.js";
import { AccessTokenGuard, type AuthenticatedRequest } from "./access-token.guard.js";
import { requestMetadata } from "./request-metadata.js";

@Controller("api/v1/auth")
export class AuthController {
  constructor(private readonly auth: AuthCommandService) {}

  @Post("registration-challenges")
  @HttpCode(HttpStatus.ACCEPTED)
  createRegistrationChallenge(@Body() body: unknown, @Req() request: Request) {
    const input = parseContract(registrationChallengeRequestSchema, body);
    return this.auth.createRegistrationChallenge(input.identity, requestMetadata(request));
  }

  @Post("register")
  register(@Body() body: unknown, @Req() request: Request) {
    return this.auth.register(parseContract(registerRequestSchema, body), requestMetadata(request));
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(@Body() body: unknown, @Req() request: Request) {
    return this.auth.login(parseContract(loginRequestSchema, body), requestMetadata(request));
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  refresh(@Body() body: unknown, @Req() request: Request) {
    const input = parseContract(refreshRequestSchema, body);
    return this.auth.refresh(input.refreshToken, requestMetadata(request));
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() body: unknown): Promise<void> {
    await this.auth.logout(parseContract(logoutRequestSchema, body).refreshToken);
  }

  @Post("logout-all")
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(@Req() request: AuthenticatedRequest): Promise<void> {
    await this.auth.logoutAll(request.auth);
  }

  @Post("password/change")
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(@Body() body: unknown, @Req() request: AuthenticatedRequest): Promise<void> {
    const input = parseContract(passwordChangeRequestSchema, body);
    await this.auth.changePassword(
      request.auth,
      input.currentPassword,
      input.newPassword,
      input.revokeOtherSessions,
    );
  }

  @Post("password-reset/challenges")
  @HttpCode(HttpStatus.ACCEPTED)
  createPasswordResetChallenge(@Body() body: unknown, @Req() request: Request) {
    const input = parseContract(passwordResetChallengeRequestSchema, body);
    return this.auth.createPasswordResetChallenge(input.identity, requestMetadata(request));
  }

  @Post("password-reset/confirm")
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmPasswordReset(@Body() body: unknown): Promise<void> {
    const input = parseContract(passwordResetConfirmRequestSchema, body);
    await this.auth.confirmPasswordReset(input.challengeId, input.code, input.newPassword);
  }
}
