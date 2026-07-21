import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  createFriendRequestSchema,
  createReportRequestSchema,
  friendRequestsQuerySchema,
  paginationQuerySchema,
  updateContactRequestSchema,
  uuidSchema,
} from "@im/contracts/api";

import { parseContract } from "../../../common/contracts/parse-contract.js";
import { AccessTokenGuard, type AuthenticatedRequest } from "../../auth/http/access-token.guard.js";
import { ContactService } from "../services/contact.service.js";

@Controller("api/v1")
@UseGuards(AccessTokenGuard)
export class ContactsController {
  constructor(private readonly contacts: ContactService) {}

  @Post("friend-requests")
  createFriendRequest(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = parseContract(createFriendRequestSchema, body);
    return this.contacts.createFriendRequest(request.auth.userId, input.userId, input.message);
  }

  @Get("friend-requests")
  listFriendRequests(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const input = parseContract(friendRequestsQuerySchema, query);
    return this.contacts.listFriendRequests(
      request.auth.userId,
      input.direction,
      input.cursor,
      input.limit,
    );
  }

  @Post("friend-requests/:requestId/accept")
  acceptFriendRequest(@Param("requestId") requestId: string, @Req() request: AuthenticatedRequest) {
    return this.contacts.decideFriendRequest(
      request.auth.userId,
      parseContract(uuidSchema, requestId),
      "ACCEPTED",
    );
  }

  @Post("friend-requests/:requestId/reject")
  rejectFriendRequest(@Param("requestId") requestId: string, @Req() request: AuthenticatedRequest) {
    return this.contacts.decideFriendRequest(
      request.auth.userId,
      parseContract(uuidSchema, requestId),
      "REJECTED",
    );
  }

  @Get("contacts")
  listContacts(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const input = parseContract(paginationQuerySchema, query);
    return this.contacts.listContacts(request.auth.userId, input.cursor, input.limit);
  }

  @Patch("contacts/:userId")
  async updateContact(
    @Param("userId") userId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parseContract(updateContactRequestSchema, body);
    await this.contacts.updateContact(
      request.auth.userId,
      parseContract(uuidSchema, userId),
      input.remark,
    );
    return { updated: true };
  }

  @Delete("contacts/:userId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteContact(
    @Param("userId") userId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.contacts.deleteContact(request.auth.userId, parseContract(uuidSchema, userId));
  }

  @Post("blocks/:userId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async block(
    @Param("userId") userId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.contacts.block(request.auth.userId, parseContract(uuidSchema, userId));
  }

  @Delete("blocks/:userId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async unblock(
    @Param("userId") userId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.contacts.unblock(request.auth.userId, parseContract(uuidSchema, userId));
  }

  @Get("blocks")
  listBlocks(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const input = parseContract(paginationQuerySchema, query);
    return this.contacts.listBlocks(request.auth.userId, input.cursor, input.limit);
  }

  @Post("reports")
  @HttpCode(HttpStatus.ACCEPTED)
  async report(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    await this.contacts.report(request.auth.userId, parseContract(createReportRequestSchema, body));
    return { accepted: true };
  }
}
