import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { MessageAccepted, SendTextMessageRequest } from "@im/contracts/messages";
import { DataSource, type EntityManager } from "typeorm";
import { v7 as uuidv7 } from "uuid";

import { AppError } from "../../../common/errors/app-error.js";
import type { AuthContext } from "../../auth/auth.types.js";
import { AuthSessionService } from "../../auth/services/auth-session.service.js";
import type { CommandTrace } from "../../conversations/services/conversation-command.service.js";
import { ContactInteractionPolicyService } from "../../contacts/services/contact-interaction-policy.service.js";
import { OutboxWriterService } from "../../outbox/services/outbox-writer.service.js";
import { ConversationMemberEntity } from "../../conversations/persistence/entities/conversation-member.entity.js";
import { ConversationUserStateEntity } from "../../conversations/persistence/entities/conversation-user-state.entity.js";
import { ConversationEntity } from "../../conversations/persistence/entities/conversation.entity.js";
import { GroupProfileEntity } from "../../groups/persistence/entities/group-profile.entity.js";
import { toMessage } from "../message.mapper.js";
import { MessageEntity } from "../persistence/entities/message.entity.js";

@Injectable()
export class MessageCommandService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly sessions: AuthSessionService,
    private readonly contacts: ContactInteractionPolicyService,
    private readonly outbox: OutboxWriterService,
  ) {}

  async sendText(
    auth: AuthContext,
    conversationId: string,
    input: SendTextMessageRequest,
    trace: CommandTrace = {},
  ): Promise<MessageAccepted> {
    const contentHash = messageContentHash(conversationId, input);
    try {
      const result = await this.dataSource.transaction(async (manager) => {
        await this.sessions.validateWithManager(manager, auth);
        const duplicate = await manager.getRepository(MessageEntity).findOneBy({
          senderId: auth.userId,
          clientMessageId: input.clientMessageId,
        });
        if (duplicate) {
          return {
            message: this.assertDuplicateMatches(duplicate, conversationId, contentHash),
            duplicate: true,
          };
        }

        const { conversation, memberIds } = await this.assertMaySend(
          manager,
          auth.userId,
          conversationId,
          input,
        );
        const result = await manager.query<[Array<{ last_seq: string | number }>, number]>(
          `UPDATE conversations
             SET last_seq = last_seq + 1, updated_at = now(), version = version + 1
           WHERE id = $1 AND status = 'ACTIVE'
           RETURNING last_seq`,
          [conversation.id],
        );
        const seq = Number(result[0][0]?.last_seq);
        if (!Number.isSafeInteger(seq) || seq <= 0) {
          throw new AppError("MESSAGE_SEQ_INVALID", "Message sequence could not be allocated", 500);
        }
        const message = await manager.getRepository(MessageEntity).save({
          id: uuidv7(),
          conversationId,
          seq,
          senderId: auth.userId,
          senderDeviceId: auth.deviceId,
          clientMessageId: input.clientMessageId,
          contentHash,
          type: "TEXT",
          contentVersion: 1,
          payload: input.payload,
          textPreview: textPreview(input.payload.text),
          replyToMessageId: null,
          forwardFromMessageId: null,
          countsUnread: true,
          editedAt: null,
          recalledAt: null,
          recalledBy: null,
        });
        await manager
          .getRepository(ConversationEntity)
          .update(
            { id: conversationId },
            { lastMessageId: message.id, lastMessageAt: message.createdAt },
          );
        await manager.query(
          `UPDATE conversation_user_states
              SET hidden_at = NULL,
                  last_delivered_seq = CASE WHEN user_id = $2 THEN GREATEST(last_delivered_seq, $3) ELSE last_delivered_seq END,
                  last_read_seq = CASE WHEN user_id = $2 THEN GREATEST(last_read_seq, $3) ELSE last_read_seq END,
          unread_count = CASE WHEN user_id <> $2 THEN unread_count + 1 ELSE unread_count END,
                  mention_count = CASE
                    WHEN user_id <> $2 AND (user_id = ANY($4::uuid[]) OR $5::boolean)
                      THEN mention_count + 1
                    ELSE mention_count
                  END,
                  updated_at = now()
            WHERE conversation_id = $1`,
          [
            conversationId,
            auth.userId,
            seq,
            input.payload.mentions ?? [],
            input.payload.mentionAll === true,
          ],
        );
        await this.outbox.append(manager, {
          eventId: uuidv7(),
          eventType: "message.created.v1",
          eventVersion: 1,
          occurredAt: message.createdAt.toISOString(),
          aggregateType: "message",
          aggregateId: message.id,
          actorUserId: auth.userId,
          audienceUserIds: memberIds,
          ...trace,
          data: toMessage(message),
        });
        return { message, duplicate: false };
      });
      return accepted(result.message, result.duplicate);
    } catch (error) {
      if (!isClientMessageUniqueViolation(error)) throw error;
      const existing = await this.dataSource.getRepository(MessageEntity).findOneBy({
        senderId: auth.userId,
        clientMessageId: input.clientMessageId,
      });
      if (!existing) throw error;
      this.assertDuplicateMatches(existing, conversationId, contentHash);
      return accepted(existing, true);
    }
  }

  private async assertMaySend(
    manager: EntityManager,
    senderId: string,
    conversationId: string,
    input: SendTextMessageRequest,
  ): Promise<{ conversation: ConversationEntity; memberIds: string[] }> {
    const conversation = await manager.getRepository(ConversationEntity).findOneBy({
      id: conversationId,
      status: "ACTIVE",
    });
    if (!conversation)
      throw new AppError("CONVERSATION_NOT_FOUND", "Conversation was not found", 404);
    const members = await manager.getRepository(ConversationMemberEntity).findBy({
      conversationId,
      status: "ACTIVE",
    });
    const sender = members.find((member) => member.userId === senderId);
    if (!sender) throw new AppError("MESSAGE_FORBIDDEN", "Message cannot be sent", 403);
    if (sender.muteUntil && sender.muteUntil.getTime() > Date.now() && sender.role === "MEMBER") {
      throw new AppError("MESSAGE_FORBIDDEN", "Message cannot be sent while muted", 403);
    }
    if (conversation.type !== "DIRECT" && conversation.type !== "GROUP") {
      throw new AppError(
        "MESSAGE_TYPE_UNSUPPORTED",
        "This conversation type does not support text messages",
        400,
      );
    }
    if (conversation.type === "DIRECT") {
      if (members.length !== 2)
        throw new AppError("CONVERSATION_CONFLICT", "Conversation membership is invalid", 409);
      const recipient = members.find((member) => member.userId !== senderId)!;
      if (input.payload.mentions?.length || input.payload.mentionAll)
        throw new AppError("MESSAGE_PAYLOAD_INVALID", "Mentions are only supported in groups", 400);
      await this.contacts.assertDirectMessagingAllowed(manager, senderId, recipient.userId);
    } else {
      const profile = await manager.getRepository(GroupProfileEntity).findOneBy({ conversationId });
      if (!profile) throw new AppError("CONVERSATION_NOT_FOUND", "Group was not found", 404);
      if (profile.allMembersMuted && sender.role === "MEMBER")
        throw new AppError("MESSAGE_FORBIDDEN", "Group messages are muted", 403);
      const activeIds = new Set(members.map((member) => member.userId));
      if (input.payload.mentions?.some((userId) => !activeIds.has(userId)))
        throw new AppError(
          "MESSAGE_PAYLOAD_INVALID",
          "Mention target is not an active member",
          400,
        );
    }
    const stateCount = await manager.getRepository(ConversationUserStateEntity).countBy({
      conversationId,
    });
    if (conversation.type === "DIRECT" && stateCount !== 2)
      throw new AppError("CONVERSATION_CONFLICT", "Conversation state is invalid", 409);
    return { conversation, memberIds: members.map((member) => member.userId) };
  }

  private assertDuplicateMatches(
    message: MessageEntity,
    conversationId: string,
    contentHash: string,
  ): MessageEntity {
    if (message.conversationId !== conversationId || message.contentHash !== contentHash) {
      throw new AppError(
        "MESSAGE_IDEMPOTENCY_CONFLICT",
        "Client message ID was already used for different content",
        409,
      );
    }
    return message;
  }
}

export function messageContentHash(conversationId: string, input: SendTextMessageRequest): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        conversationId,
        type: input.type,
        contentVersion: input.contentVersion,
        payload: input.payload,
      }),
    )
    .digest("hex");
}

function textPreview(text: string): string {
  return Array.from(text).slice(0, 280).join("");
}

function accepted(message: MessageEntity, duplicate: boolean): MessageAccepted {
  return {
    status: "ACCEPTED",
    messageId: message.id,
    conversationId: message.conversationId,
    seq: message.seq,
    duplicate,
    serverTimestamp: Date.now(),
  };
}

function isClientMessageUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505" &&
    "constraint" in error &&
    error.constraint === "messages_sender_id_client_message_id_key"
  );
}
