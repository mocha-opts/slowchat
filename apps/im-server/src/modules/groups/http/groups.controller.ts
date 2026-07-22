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
  addGroupMemberRequestSchema,
  createGroupInviteRequestSchema,
  createGroupJoinRequestSchema,
  createGroupRequestSchema,
  groupInviteDecisionSchema,
  groupJoinRequestListQuerySchema,
  groupMemberListQuerySchema,
  transferGroupOwnerRequestSchema,
  updateGroupMemberRequestSchema,
  updateGroupRequestSchema,
  uuidSchema,
} from "@im/contracts/api";

import { parseContract } from "../../../common/contracts/parse-contract.js";
import { AccessTokenGuard, type AuthenticatedRequest } from "../../auth/http/access-token.guard.js";
import { GroupCommandService } from "../services/group-command.service.js";
import { GroupQueryService } from "../services/group-query.service.js";

@Controller("api/v1")
@UseGuards(AccessTokenGuard)
export class GroupsController {
  constructor(
    private readonly commands: GroupCommandService,
    private readonly queries: GroupQueryService,
  ) {}

  @Post("conversations/groups")
  create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.commands.create(request.auth, parseContract(createGroupRequestSchema, body));
  }

  @Get("conversations/:conversationId/group")
  profile(@Param("conversationId") id: string, @Req() request: AuthenticatedRequest) {
    return this.queries.profile(request.auth.userId, parseContract(uuidSchema, id));
  }

  @Patch("conversations/:conversationId/group")
  updateProfile(
    @Param("conversationId") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commands.updateProfile(
      request.auth,
      parseContract(uuidSchema, id),
      parseContract(updateGroupRequestSchema, body),
    );
  }

  @Get("conversations/:conversationId/members")
  members(
    @Param("conversationId") id: string,
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parseContract(groupMemberListQuerySchema, query);
    return this.queries.members(
      request.auth.userId,
      parseContract(uuidSchema, id),
      input.cursor,
      input.limit,
    );
  }

  @Post("conversations/:conversationId/members")
  addMember(
    @Param("conversationId") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commands.invite(
      request.auth,
      parseContract(uuidSchema, id),
      parseContract(addGroupMemberRequestSchema, body),
    );
  }

  @Patch("conversations/:conversationId/members/:userId")
  updateMember(
    @Param("conversationId") id: string,
    @Param("userId") userId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parseContract(updateGroupMemberRequestSchema, body);
    return this.commands.updateMember(
      request.auth,
      parseContract(uuidSchema, id),
      parseContract(uuidSchema, userId),
      input.role,
      input.muteUntil === undefined
        ? undefined
        : input.muteUntil === null
          ? null
          : new Date(input.muteUntil),
    );
  }

  @Delete("conversations/:conversationId/members/:userId")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param("conversationId") id: string,
    @Param("userId") userId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commands.remove(
      request.auth,
      parseContract(uuidSchema, id),
      parseContract(uuidSchema, userId),
    );
  }

  @Post("conversations/:conversationId/leave")
  @HttpCode(HttpStatus.NO_CONTENT)
  leave(@Param("conversationId") id: string, @Req() request: AuthenticatedRequest) {
    return this.commands.leave(request.auth, parseContract(uuidSchema, id));
  }

  @Post("conversations/:conversationId/transfer-owner")
  @HttpCode(HttpStatus.NO_CONTENT)
  transferOwner(
    @Param("conversationId") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parseContract(transferGroupOwnerRequestSchema, body);
    return this.commands.transferOwner(request.auth, parseContract(uuidSchema, id), input.userId);
  }

  @Delete("conversations/:conversationId")
  @HttpCode(HttpStatus.NO_CONTENT)
  disband(@Param("conversationId") id: string, @Req() request: AuthenticatedRequest) {
    return this.commands.disband(request.auth, parseContract(uuidSchema, id));
  }

  @Post("conversations/:conversationId/invites")
  invite(
    @Param("conversationId") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commands.invite(
      request.auth,
      parseContract(uuidSchema, id),
      parseContract(createGroupInviteRequestSchema, body),
    );
  }

  @Post("group-invites/:inviteId/decision")
  decideInvite(
    @Param("inviteId") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parseContract(groupInviteDecisionSchema, body);
    return this.commands.decideInvite(request.auth, parseContract(uuidSchema, id), input.decision);
  }

  @Post("conversations/:conversationId/join-requests")
  requestJoin(
    @Param("conversationId") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commands.requestJoin(
      request.auth,
      parseContract(uuidSchema, id),
      parseContract(createGroupJoinRequestSchema, body),
    );
  }

  @Get("conversations/:conversationId/join-requests")
  listJoinRequests(
    @Param("conversationId") id: string,
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    // P5 的管理列表直接分页查询，避免把所有申请加载到内存中。
    const input = parseContract(groupJoinRequestListQuerySchema, query);
    return this.commands.listJoinRequests(
      request.auth,
      parseContract(uuidSchema, id),
      input.cursor,
      input.limit,
      input.status,
    );
  }

  @Post("group-join-requests/:requestId/decision")
  decideJoinRequest(
    @Param("requestId") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parseContract(groupInviteDecisionSchema, body);
    return this.commands.decideJoinRequest(
      request.auth,
      parseContract(uuidSchema, id),
      input.decision === "ACCEPTED" ? "APPROVED" : "REJECTED",
    );
  }
}
