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
  conversationListQuerySchema,
  createDirectConversationRequestSchema,
  readConversationRequestSchema,
  updateConversationSettingsRequestSchema,
  uuidSchema,
} from "@im/contracts/api";

import { parseContract } from "../../../common/contracts/parse-contract.js";
import { requestTrace } from "../../../common/request/request-trace.js";
import { AccessTokenGuard, type AuthenticatedRequest } from "../../auth/http/access-token.guard.js";
import { ConversationCommandService } from "../services/conversation-command.service.js";
import { ConversationQueryService } from "../services/conversation-query.service.js";

@Controller("api/v1/conversations")
@UseGuards(AccessTokenGuard)
export class ConversationsController {
  constructor(
    private readonly commands: ConversationCommandService,
    private readonly queries: ConversationQueryService,
  ) {}

  @Post("direct")
  createDirect(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = parseContract(createDirectConversationRequestSchema, body);
    return this.commands.createDirect(request.auth, input.userId, requestTrace(request));
  }

  @Get()
  list(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const input = parseContract(conversationListQuerySchema, query);
    return this.queries.list(request.auth.userId, input.cursor, input.limit);
  }

  @Get(":conversationId")
  get(@Param("conversationId") id: string, @Req() request: AuthenticatedRequest) {
    return this.queries.get(request.auth.userId, parseContract(uuidSchema, id));
  }

  @Patch(":conversationId/settings")
  updateSettings(
    @Param("conversationId") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commands.updateSettings(
      request.auth,
      parseContract(uuidSchema, id),
      parseContract(updateConversationSettingsRequestSchema, body),
      requestTrace(request),
    );
  }

  @Delete(":conversationId/view")
  @HttpCode(HttpStatus.NO_CONTENT)
  hide(@Param("conversationId") id: string, @Req() request: AuthenticatedRequest): Promise<void> {
    return this.commands.hide(request.auth, parseContract(uuidSchema, id));
  }

  @Post(":conversationId/read")
  @HttpCode(HttpStatus.OK)
  read(
    @Param("conversationId") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parseContract(readConversationRequestSchema, body);
    return this.commands.read(
      request.auth,
      parseContract(uuidSchema, id),
      input.lastReadSeq,
      requestTrace(request),
    );
  }
}
