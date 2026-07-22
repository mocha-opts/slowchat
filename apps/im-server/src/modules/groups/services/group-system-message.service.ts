import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { SystemMessagePayload } from "@im/contracts/messages";
import type { EntityManager } from "typeorm";
import { v7 as uuidv7 } from "uuid";

import type { AuthContext } from "../../auth/auth.types.js";
import { MessageEntity } from "../../messages/persistence/entities/message.entity.js";
import { toMessage } from "../../messages/message.mapper.js";
import { OutboxWriterService } from "../../outbox/services/outbox-writer.service.js";
import { ConversationMemberEntity } from "../../conversations/persistence/entities/conversation-member.entity.js";
import { ConversationEntity } from "../../conversations/persistence/entities/conversation.entity.js";

/**
 * 群成员变化必须和普通消息共享会话 Seq，避免客户端需要维护第二套顺序。
 * 该 Service 只在已开启的 Command 事务中使用传入 EntityManager。
 */
@Injectable()
export class GroupSystemMessageService {
  constructor(private readonly outbox: OutboxWriterService) {}

  async append(
    manager: EntityManager,
    auth: AuthContext,
    conversation: ConversationEntity,
    kind: SystemMessagePayload["kind"],
    targetUserId: string | null,
    metadata: Record<string, unknown>,
    audienceUserIds?: readonly string[],
  ): Promise<MessageEntity> {
    const result = await manager.query<[Array<{ last_seq: string | number }>, number]>(
      `UPDATE conversations
       SET last_seq = last_seq + 1, last_message_at = now(), updated_at = now(), version = version + 1
       WHERE id = $1 AND status = 'ACTIVE'
       RETURNING last_seq`,
      [conversation.id],
    );
    const seq = Number(result[0][0]?.last_seq);
    if (!Number.isSafeInteger(seq) || seq <= 0)
      throw new Error("Group system sequence allocation failed");
    const payload: SystemMessagePayload = {
      kind,
      actorUserId: auth.userId,
      ...(targetUserId ? { targetUserId } : {}),
      metadata,
    };
    const id = uuidv7();
    const message = await manager.getRepository(MessageEntity).save({
      id,
      conversationId: conversation.id,
      seq,
      senderId: auth.userId,
      senderDeviceId: auth.deviceId,
      clientMessageId: uuidv7(),
      contentHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
      type: "SYSTEM",
      contentVersion: 1,
      payload,
      textPreview: kind,
      replyToMessageId: null,
      forwardFromMessageId: null,
      countsUnread: false,
      editedAt: null,
      recalledAt: null,
      recalledBy: null,
    });
    await manager
      .getRepository(ConversationEntity)
      .update({ id: conversation.id }, { lastMessageId: id, lastMessageAt: message.createdAt });
    const audience =
      audienceUserIds ??
      (
        await manager.getRepository(ConversationMemberEntity).findBy({
          conversationId: conversation.id,
          status: "ACTIVE",
        })
      ).map((member) => member.userId);
    await this.outbox.append(manager, {
      eventId: uuidv7(),
      eventType: "message.created.v1",
      eventVersion: 1,
      occurredAt: message.createdAt.toISOString(),
      aggregateType: "message",
      aggregateId: id,
      actorUserId: auth.userId,
      audienceUserIds: [...new Set(audience)],
      data: toMessage(message),
    });
    return message;
  }
}
