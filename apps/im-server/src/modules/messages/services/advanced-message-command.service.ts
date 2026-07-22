import { Inject, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { AddReactionRequest, ForwardMessageRequest } from "@im/contracts/api";
import type {
  Message,
  MessageAccepted,
  MessageReaction,
  SendMessageRequest,
} from "@im/contracts/messages";
import { DataSource, type EntityManager } from "typeorm";
import { v7 as uuidv7 } from "uuid";

import { AppError } from "../../../common/errors/app-error.js";
import { APP_CONFIG, type AppConfig } from "../../../platform/config/app-config.js";
import type { AuthContext } from "../../auth/auth.types.js";
import { AuthSessionService } from "../../auth/services/auth-session.service.js";
import { ConversationMemberEntity } from "../../conversations/persistence/entities/conversation-member.entity.js";
import { ConversationEntity } from "../../conversations/persistence/entities/conversation.entity.js";
import { ConversationUserStateEntity } from "../../conversations/persistence/entities/conversation-user-state.entity.js";
import { toConversation } from "../../conversations/conversation.mapper.js";
import { OutboxWriterService } from "../../outbox/services/outbox-writer.service.js";
import { toMessage } from "../message.mapper.js";
import { MessageEntity } from "../persistence/entities/message.entity.js";
import { MessageReactionEntity } from "../persistence/entities/message-reaction.entity.js";
import { MessageUserHideEntity } from "../persistence/entities/message-user-hide.entity.js";
import { MessageCommandService } from "./message-command.service.js";

export interface AdvancedMessageTrace {
  requestId?: string;
  traceId?: string;
}

@Injectable()
export class AdvancedMessageCommandService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly sessions: AuthSessionService,
    private readonly outbox: OutboxWriterService,
    private readonly messages: MessageCommandService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async recall(
    auth: AuthContext,
    messageId: string,
    trace: AdvancedMessageTrace = {},
  ): Promise<Message> {
    // 撤回必须锁定消息行，避免两个设备同时撤回时产生不同的状态和事件。
    return this.dataSource.transaction(async (manager) => {
      await this.sessions.validateWithManager(manager, auth);
      const message = await manager.getRepository(MessageEntity).findOne({
        where: { id: messageId },
        lock: { mode: "pessimistic_write" },
      });
      if (!message) throw new AppError("MESSAGE_NOT_FOUND", "Message was not found", 404);
      const member = await this.activeMember(manager, auth.userId, message.conversationId);
      if (!member) throw new AppError("MESSAGE_FORBIDDEN", "Message action is forbidden", 403);
      if (message.recalledAt)
        throw new AppError("MESSAGE_ALREADY_RECALLED", "Message is already recalled", 409);
      const isModerator = member.role === "OWNER" || member.role === "ADMIN";
      if (message.senderId !== auth.userId && !(isModerator && member.role !== "MEMBER")) {
        throw new AppError(
          "MESSAGE_FORBIDDEN",
          "Only the sender or group moderator may recall",
          403,
        );
      }
      if (
        message.senderId === auth.userId &&
        Date.now() - message.createdAt.getTime() > this.config.auth.recallWindowSeconds * 1000
      ) {
        throw new AppError(
          "MESSAGE_RECALL_WINDOW_EXPIRED",
          "Message recall window has expired",
          409,
        );
      }
      message.recalledAt = new Date();
      message.recalledBy = auth.userId;
      await manager.getRepository(MessageEntity).save(message);
      const audience = await this.audience(manager, message.conversationId);
      await this.outbox.append(manager, {
        eventId: uuidv7(),
        eventType: "message.recalled.v1",
        eventVersion: 1,
        occurredAt: message.recalledAt.toISOString(),
        aggregateType: "message",
        aggregateId: message.id,
        actorUserId: auth.userId,
        audienceUserIds: audience,
        ...trace,
        data: toMessage(message),
      });
      return toMessage(message);
    });
  }

  async addReaction(
    auth: AuthContext,
    messageId: string,
    input: AddReactionRequest,
    trace: AdvancedMessageTrace = {},
  ): Promise<MessageReaction> {
    // 唯一键负责并发幂等；只有真正插入新 Reaction 才写 Outbox 事件。
    return this.dataSource.transaction(async (manager) => {
      await this.sessions.validateWithManager(manager, auth);
      const message = await this.requireMemberMessage(manager, auth.userId, messageId);
      const repository = manager.getRepository(MessageReactionEntity);
      const inserted = await repository
        .createQueryBuilder()
        .insert()
        .into(MessageReactionEntity)
        .values({ id: uuidv7(), messageId, userId: auth.userId, reaction: input.reaction })
        .orIgnore()
        .execute();
      const reaction = await repository.findOneByOrFail({
        messageId,
        userId: auth.userId,
        reaction: input.reaction,
      });
      if (!inserted.identifiers.length) return toReaction(reaction);
      const created = reaction.createdAt.toISOString();
      const audience = await this.audience(manager, message.conversationId);
      await this.outbox.append(manager, {
        eventId: uuidv7(),
        eventType: "message.reaction.updated.v1",
        eventVersion: 1,
        occurredAt: created,
        aggregateType: "message",
        aggregateId: message.id,
        actorUserId: auth.userId,
        audienceUserIds: audience,
        ...trace,
        data: {
          messageId: message.id,
          conversationId: message.conversationId,
          userId: auth.userId,
          reaction: input.reaction,
          action: "ADDED",
        },
      });
      return toReaction(reaction);
    });
  }

  async removeReaction(
    auth: AuthContext,
    messageId: string,
    reactionValue: string,
    trace: AdvancedMessageTrace = {},
  ): Promise<void> {
    // 隐藏是用户视图状态，消息事实仍保留给其他成员读取。
    return this.dataSource.transaction(async (manager) => {
      await this.sessions.validateWithManager(manager, auth);
      const message = await this.requireMemberMessage(manager, auth.userId, messageId);
      const deleted = await manager.getRepository(MessageReactionEntity).delete({
        messageId,
        userId: auth.userId,
        reaction: reactionValue,
      });
      if (!deleted.affected)
        throw new AppError("REACTION_NOT_FOUND", "Reaction was not found", 404);
      await this.outbox.append(manager, {
        eventId: uuidv7(),
        eventType: "message.reaction.updated.v1",
        eventVersion: 1,
        occurredAt: new Date().toISOString(),
        aggregateType: "message",
        aggregateId: message.id,
        actorUserId: auth.userId,
        audienceUserIds: await this.audience(manager, message.conversationId),
        ...trace,
        data: {
          messageId: message.id,
          conversationId: message.conversationId,
          userId: auth.userId,
          reaction: reactionValue,
          action: "REMOVED",
        },
      });
    });
  }

  async hideMessage(
    auth: AuthContext,
    messageId: string,
    trace: AdvancedMessageTrace = {},
  ): Promise<void> {
    // 清空历史只推进当前用户游标，不能删除会话中的共享消息。
    return this.dataSource.transaction(async (manager) => {
      await this.sessions.validateWithManager(manager, auth);
      const message = await this.requireMemberMessage(manager, auth.userId, messageId);
      const inserted = await manager
        .getRepository(MessageUserHideEntity)
        .createQueryBuilder()
        .insert()
        .into(MessageUserHideEntity)
        .values({ userId: auth.userId, messageId })
        .orIgnore()
        .execute();
      if (!inserted.identifiers.length) return;
      await this.outbox.append(manager, {
        eventId: uuidv7(),
        eventType: "message.hidden.v1",
        eventVersion: 1,
        occurredAt: new Date().toISOString(),
        aggregateType: "message",
        aggregateId: message.id,
        actorUserId: auth.userId,
        audienceUserIds: [auth.userId],
        ...trace,
        data: {
          messageId,
          conversationId: message.conversationId,
          userId: auth.userId,
          hidden: true,
        },
      });
    });
  }

  async clearHistory(
    auth: AuthContext,
    conversationId: string,
    trace: AdvancedMessageTrace = {},
  ): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      await this.sessions.validateWithManager(manager, auth);
      const conversation = await manager.getRepository(ConversationEntity).findOneBy({
        id: conversationId,
        status: "ACTIVE",
      });
      if (!conversation)
        throw new AppError("CONVERSATION_NOT_FOUND", "Conversation was not found", 404);
      const member = await this.activeMember(manager, auth.userId, conversationId);
      if (!member)
        throw new AppError("CONVERSATION_FORBIDDEN", "Conversation access is forbidden", 403);
      const state = await manager.getRepository(ConversationUserStateEntity).findOne({
        where: { conversationId, userId: auth.userId },
        lock: { mode: "pessimistic_write" },
      });
      if (!state) throw new AppError("CONVERSATION_NOT_FOUND", "Conversation was not found", 404);
      state.clearBeforeSeq = Math.max(state.clearBeforeSeq, conversation.lastSeq);
      state.unreadCount = 0;
      state.mentionCount = 0;
      await manager.getRepository(ConversationUserStateEntity).save(state);
      await this.outbox.append(manager, {
        eventId: uuidv7(),
        eventType: "conversation.updated.v1",
        eventVersion: 1,
        occurredAt: new Date().toISOString(),
        aggregateType: "conversation",
        aggregateId: conversation.id,
        actorUserId: auth.userId,
        audienceUserIds: [auth.userId],
        ...trace,
        data: toConversation(conversation, state, null, null),
      });
    });
  }

  async forward(
    auth: AuthContext,
    messageId: string,
    input: ForwardMessageRequest,
    trace: AdvancedMessageTrace = {},
  ): Promise<MessageAccepted> {
    // 转发也必须复核会话状态；HTTP Guard 只负责初步验签，事务命令仍以数据库为准。
    await this.sessions.validate(auth);
    const source = await this.dataSource.getRepository(MessageEntity).findOneBy({ id: messageId });
    if (
      !source ||
      !(await this.dataSource.getRepository(ConversationMemberEntity).existsBy({
        conversationId: source.conversationId,
        userId: auth.userId,
        status: "ACTIVE",
      }))
    ) {
      throw new AppError("MESSAGE_NOT_FOUND", "Message was not found", 404);
    }
    if (source.type !== "TEXT")
      throw new AppError("MESSAGE_TYPE_UNSUPPORTED", "Only text forwarding is supported", 400);
    const payload = source.payload as { text?: unknown };
    if (typeof payload.text !== "string")
      throw new AppError("MESSAGE_PAYLOAD_INVALID", "Forward source payload is invalid", 400);
    const command: SendMessageRequest = {
      clientMessageId: input.clientMessageId,
      type: "TEXT",
      contentVersion: 1,
      payload: { text: payload.text },
      forwardFromMessageId: messageId,
    };
    return this.messages.sendText(auth, input.conversationId, command, trace);
  }

  private async requireMemberMessage(manager: EntityManager, userId: string, messageId: string) {
    const message = await manager.getRepository(MessageEntity).findOneBy({ id: messageId });
    if (!message) throw new AppError("MESSAGE_NOT_FOUND", "Message was not found", 404);
    if (!(await this.activeMember(manager, userId, message.conversationId)))
      throw new AppError("MESSAGE_FORBIDDEN", "Message action is forbidden", 403);
    return message;
  }

  private activeMember(manager: EntityManager, userId: string, conversationId: string) {
    return manager.getRepository(ConversationMemberEntity).findOneBy({
      userId,
      conversationId,
      status: "ACTIVE",
    });
  }

  private async audience(manager: EntityManager, conversationId: string): Promise<string[]> {
    const rows = await manager.getRepository(ConversationMemberEntity).findBy({
      conversationId,
      status: "ACTIVE",
    });
    return rows.map((row) => row.userId);
  }
}

function toReaction(value: MessageReactionEntity): MessageReaction {
  return {
    id: value.id,
    messageId: value.messageId,
    userId: value.userId,
    reaction: value.reaction,
    createdAt: value.createdAt.toISOString(),
  };
}
