import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import {
  messageRangeQuerySchema,
  syncEventsQuerySchema,
  syncRequestSchema,
  uuidSchema,
} from "@im/contracts/api";

import { parseContract } from "../../../common/contracts/parse-contract.js";
import { AccessTokenGuard, type AuthenticatedRequest } from "../../auth/http/access-token.guard.js";
import { SyncQueryService } from "../services/sync-query.service.js";

@Controller("api/v1")
@UseGuards(AccessTokenGuard)
export class SyncController {
  constructor(private readonly sync: SyncQueryService) {}

  @Post("sync")
  syncNow(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.sync.sync(request.auth.userId, parseContract(syncRequestSchema, body));
  }

  @Get("sync/events")
  events(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    return this.sync.events(request.auth.userId, parseContract(syncEventsQuerySchema, query));
  }

  @Get("sync/snapshot")
  snapshot(@Query("deviceId") deviceId: string, @Req() request: AuthenticatedRequest) {
    return this.sync.snapshot(request.auth.userId, parseContract(uuidSchema, deviceId));
  }

  @Get("conversations/:conversationId/messages/range")
  range(
    @Param("conversationId") conversationId: string,
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parseContract(messageRangeQuerySchema, query);
    return this.sync.messageRange(
      request.auth.userId,
      parseContract(uuidSchema, conversationId),
      input.afterSeq,
      input.beforeSeq,
      input.limit,
    );
  }
}
