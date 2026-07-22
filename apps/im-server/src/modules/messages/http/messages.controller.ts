import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { messageHistoryQuerySchema, uuidSchema } from "@im/contracts/api";
import { sendMessageRequestSchema } from "@im/contracts/messages";

import { parseContract } from "../../../common/contracts/parse-contract.js";
import { requestTrace } from "../../../common/request/request-trace.js";
import { AccessTokenGuard, type AuthenticatedRequest } from "../../auth/http/access-token.guard.js";
import { MessageCommandService } from "../services/message-command.service.js";
import { MessageQueryService } from "../services/message-query.service.js";

@Controller("api/v1")
@UseGuards(AccessTokenGuard)
export class MessagesController {
  constructor(
    private readonly commands: MessageCommandService,
    private readonly queries: MessageQueryService,
  ) {}

  @Post("conversations/:conversationId/messages")
  send(
    @Param("conversationId") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commands.sendText(
      request.auth,
      parseContract(uuidSchema, id),
      parseContract(sendMessageRequestSchema, body),
      requestTrace(request),
    );
  }

  @Get("conversations/:conversationId/messages")
  history(
    @Param("conversationId") id: string,
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parseContract(messageHistoryQuerySchema, query);
    return this.queries.history(
      request.auth.userId,
      parseContract(uuidSchema, id),
      input.beforeSeq,
      input.limit,
    );
  }

  @Get("messages/:messageId")
  get(@Param("messageId") id: string, @Req() request: AuthenticatedRequest) {
    return this.queries.get(request.auth.userId, parseContract(uuidSchema, id));
  }
}
