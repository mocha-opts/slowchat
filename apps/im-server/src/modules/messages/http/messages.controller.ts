import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  addReactionRequestSchema,
  forwardMessageRequestSchema,
  messageHistoryQuerySchema,
  messageSearchQuerySchema,
  uuidSchema,
} from "@im/contracts/api";
import { sendMessageRequestSchema } from "@im/contracts/messages";
import { reactionSchema } from "@im/contracts/messages";

import { parseContract } from "../../../common/contracts/parse-contract.js";
import { requestTrace } from "../../../common/request/request-trace.js";
import { AccessTokenGuard, type AuthenticatedRequest } from "../../auth/http/access-token.guard.js";
import { MessageCommandService } from "../services/message-command.service.js";
import { MessageQueryService } from "../services/message-query.service.js";
import { AdvancedMessageCommandService } from "../services/advanced-message-command.service.js";

@Controller("api/v1")
@UseGuards(AccessTokenGuard)
export class MessagesController {
  constructor(
    private readonly commands: MessageCommandService,
    private readonly queries: MessageQueryService,
    private readonly advanced: AdvancedMessageCommandService,
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

  @Get("messages/search")
  search(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const input = parseContract(messageSearchQuerySchema, query);
    return this.queries.search(request.auth.userId, input.q, input.cursor, input.limit);
  }

  @Get("messages/:messageId")
  get(@Param("messageId") id: string, @Req() request: AuthenticatedRequest) {
    return this.queries.get(request.auth.userId, parseContract(uuidSchema, id));
  }

  @Post("messages/:messageId/recall")
  recall(@Param("messageId") id: string, @Req() request: AuthenticatedRequest) {
    return this.advanced.recall(request.auth, parseContract(uuidSchema, id), requestTrace(request));
  }

  @Delete("messages/:messageId/view")
  @HttpCode(HttpStatus.NO_CONTENT)
  hide(@Param("messageId") id: string, @Req() request: AuthenticatedRequest) {
    return this.advanced.hideMessage(
      request.auth,
      parseContract(uuidSchema, id),
      requestTrace(request),
    );
  }

  @Post("messages/:messageId/reactions")
  addReaction(
    @Param("messageId") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.advanced.addReaction(
      request.auth,
      parseContract(uuidSchema, id),
      parseContract(addReactionRequestSchema, body),
      requestTrace(request),
    );
  }

  @Delete("messages/:messageId/reactions/:reaction")
  removeReaction(
    @Param("messageId") id: string,
    @Param("reaction") reaction: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.advanced.removeReaction(
      request.auth,
      parseContract(uuidSchema, id),
      parseContract(reactionSchema, reaction),
      requestTrace(request),
    );
  }

  @Post("messages/:messageId/forward")
  forward(
    @Param("messageId") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.advanced.forward(
      request.auth,
      parseContract(uuidSchema, id),
      parseContract(forwardMessageRequestSchema, body),
      requestTrace(request),
    );
  }
}
