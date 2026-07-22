import { Inject, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { Attachment, AttachmentDownload } from "@im/contracts/api";
import { DataSource } from "typeorm";

import { AppError } from "../../../common/errors/app-error.js";
import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
} from "../../../platform/storage/object-storage.port.js";
import type { AuthContext } from "../../auth/auth.types.js";
import { AuthSessionService } from "../../auth/services/auth-session.service.js";
import { ConversationMemberEntity } from "../../conversations/persistence/entities/conversation-member.entity.js";
import { MessageEntity } from "../../messages/persistence/entities/message.entity.js";
import { AttachmentEntity } from "../persistence/entities/attachment.entity.js";
import { toAttachment } from "../media.mapper.js";

@Injectable()
export class AttachmentAccessService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly sessions: AuthSessionService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {}

  async get(auth: AuthContext, attachmentId: string): Promise<Attachment> {
    await this.sessions.validate(auth);
    const attachment = await this.findReadyOrThrow(attachmentId);
    await this.assertOwnerOrMentionedMember(auth.userId, attachment.id);
    return toAttachment(attachment);
  }

  async download(auth: AuthContext, attachmentId: string): Promise<AttachmentDownload> {
    await this.sessions.validate(auth);
    const attachment = await this.findReadyOrThrow(attachmentId);
    await this.assertOwnerOrMentionedMember(auth.userId, attachment.id);
    const expiresAt = new Date(Date.now() + 300_000);
    return {
      attachmentId,
      downloadUrl: await this.storage.createPresignedGetUrl(attachment.objectKey, 300),
      expiresAt: expiresAt.toISOString(),
    };
  }

  private async findReadyOrThrow(id: string): Promise<AttachmentEntity> {
    const attachment = await this.dataSource.getRepository(AttachmentEntity).findOneBy({ id });
    if (!attachment) throw new AppError("ATTACHMENT_NOT_FOUND", "Attachment was not found", 404);
    if (attachment.status === "QUARANTINED")
      throw new AppError("ATTACHMENT_QUARANTINED", "Attachment is quarantined", 403);
    if (attachment.status !== "READY")
      throw new AppError("ATTACHMENT_NOT_READY", "Attachment is not ready", 409);
    return attachment;
  }

  private async assertOwnerOrMentionedMember(userId: string, attachmentId: string): Promise<void> {
    const owner = await this.dataSource
      .getRepository(AttachmentEntity)
      .existsBy({ id: attachmentId, ownerId: userId });
    if (owner) return;
    const rows = await this.dataSource
      .getRepository(MessageEntity)
      .createQueryBuilder("message")
      .innerJoin(
        ConversationMemberEntity,
        "member",
        "member.conversation_id = message.conversation_id AND member.user_id = :userId AND member.status = 'ACTIVE'",
        { userId },
      )
      .where("message.payload ->> 'attachmentId' = :attachmentId", { attachmentId })
      .getCount();
    if (rows === 0)
      throw new AppError("ATTACHMENT_FORBIDDEN", "Attachment access is forbidden", 403);
  }
}
