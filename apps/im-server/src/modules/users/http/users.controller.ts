import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  deleteCurrentUserRequestSchema,
  updateCurrentUserRequestSchema,
  userSearchQuerySchema,
  uuidSchema,
} from "@im/contracts/api";

import { parseContract } from "../../../common/contracts/parse-contract.js";
import { AccessTokenGuard, type AuthenticatedRequest } from "../../auth/http/access-token.guard.js";
import { UserService } from "../services/user.service.js";

@Controller("api/v1/users")
@UseGuards(AccessTokenGuard)
export class UsersController {
  constructor(private readonly users: UserService) {}

  @Get("me")
  getCurrent(@Req() request: AuthenticatedRequest) {
    return this.users.getCurrent(request.auth.userId);
  }

  @Patch("me")
  updateCurrent(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.users.updateCurrent(
      request.auth.userId,
      parseContract(updateCurrentUserRequestSchema, body),
    );
  }

  @Delete("me")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCurrent(@Body() body: unknown, @Req() request: AuthenticatedRequest): Promise<void> {
    await this.users.deleteCurrent(
      request.auth,
      parseContract(deleteCurrentUserRequestSchema, body).password,
    );
  }

  @Get("search")
  search(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const input = parseContract(userSearchQuerySchema, query);
    return this.users.search(request.auth.userId, input.query, input.cursor, input.limit);
  }

  @Get(":userId")
  getPublic(@Param("userId") userId: string, @Req() request: AuthenticatedRequest) {
    return this.users.getPublic(request.auth.userId, parseContract(uuidSchema, userId));
  }
}
