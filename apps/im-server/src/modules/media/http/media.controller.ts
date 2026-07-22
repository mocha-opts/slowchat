import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { createUploadRequestSchema, uuidSchema } from "@im/contracts/api";

import { parseContract } from "../../../common/contracts/parse-contract.js";
import { AccessTokenGuard, type AuthenticatedRequest } from "../../auth/http/access-token.guard.js";
import { AttachmentAccessService } from "../services/attachment-access.service.js";
import { AttachmentCommandService } from "../services/attachment-command.service.js";
import { UploadCommandService } from "../services/upload-command.service.js";
import { UploadQueryService } from "../services/upload-query.service.js";

@Controller("api/v1")
@UseGuards(AccessTokenGuard)
export class MediaController {
  constructor(
    private readonly uploads: UploadCommandService,
    private readonly uploadQueries: UploadQueryService,
    private readonly attachments: AttachmentAccessService,
    private readonly commands: AttachmentCommandService,
  ) {}

  @Post("uploads")
  create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.uploads.create(request.auth, parseContract(createUploadRequestSchema, body));
  }

  @Post("uploads/:uploadId/complete")
  complete(@Param("uploadId") id: string, @Req() request: AuthenticatedRequest) {
    return this.commands.complete(request.auth, parseContract(uuidSchema, id));
  }

  @Get("uploads/:uploadId")
  getUpload(@Param("uploadId") id: string, @Req() request: AuthenticatedRequest) {
    return this.uploadQueries.get(request.auth, parseContract(uuidSchema, id));
  }

  @Delete("uploads/:uploadId")
  cancel(@Param("uploadId") id: string, @Req() request: AuthenticatedRequest) {
    return this.uploads.cancel(request.auth, parseContract(uuidSchema, id));
  }

  @Get("attachments/:attachmentId")
  getAttachment(@Param("attachmentId") id: string, @Req() request: AuthenticatedRequest) {
    return this.attachments.get(request.auth, parseContract(uuidSchema, id));
  }

  @Get("attachments/:attachmentId/download")
  download(@Param("attachmentId") id: string, @Req() request: AuthenticatedRequest) {
    return this.attachments.download(request.auth, parseContract(uuidSchema, id));
  }
}
