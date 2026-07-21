import { Body, Controller, Get, Patch, Req, UseGuards } from "@nestjs/common";
import { updatePrivacySettingsRequestSchema } from "@im/contracts/api";

import { parseContract } from "../../../common/contracts/parse-contract.js";
import { AccessTokenGuard, type AuthenticatedRequest } from "../../auth/http/access-token.guard.js";
import { UserService } from "../services/user.service.js";

@Controller("api/v1/privacy-settings")
@UseGuards(AccessTokenGuard)
export class PrivacySettingsController {
  constructor(private readonly users: UserService) {}

  @Get()
  get(@Req() request: AuthenticatedRequest) {
    return this.users.getPrivacy(request.auth.userId);
  }

  @Patch()
  update(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.users.updatePrivacy(
      request.auth.userId,
      parseContract(updatePrivacySettingsRequestSchema, body),
    );
  }
}
