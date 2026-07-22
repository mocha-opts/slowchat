import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { Conversation, UpdateConversationSettingsRequest } from "@im/contracts/api";
import type { Receipt } from "@im/contracts/messages";
import { DataSource, In, type EntityManager } from "typeorm";
import { v7 as uuidv7 } from "uuid";

import { AppError } from "../../../common/errors/app-error.js";
import type { AuthContext } from "../../auth/auth.types.js";
import { AuthSessionService } from "../../auth/services/auth-session.service.js";
import { ContactInteractionPolicyService } from "../../contacts/services/contact-interaction-policy.service.js";
import { MessageEntity } from "../../messages/persistence/entities/message.entity.js";
import { OutboxWriterService } from "../../outbox/services/outbox-writer.service.js";
import { UserEntity } from "../../users/persistence/entities/user.entity.js";
import { toConversation } from "../conversation.mapper.js";
import { ConversationMemberEntity } from "../persistence/entities/conversation-member.entity.js";
import { ConversationUserStateEntity } from "../persistence/entities/conversation-user-state.entity.js";
import { ConversationEntity } from "../persistence/entities/conversation.entity.js";
import { ConversationQueryService } from "./conversation-query.service.js";

export interface CommandTrace {
  requestId?: string;
  traceId?: string;
}

@Injectable()
export class ConversationCommandService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly sessions: AuthSessionService,
    private readonly contacts: ContactInteractionPolicyService,
    private readonly outbox: OutboxWriterService,
    private readonly queries: ConversationQueryService,
  ) {}

  async createDirect(
    auth: AuthContext,
    recipientId: string,
    trace: CommandTrace = {},
  ): Promise<Conversation> {
    if (auth.userId === recipientId) {
      throw new AppError(
        "CONVERSATION_CONFLICT",
        "Cannot create a direct conversation with yourself",
        409,
      );
    }
    const directKey = directConversationKey(auth.userId, recipientId);
    try {
      const conversationId = await this.dataSource.transaction(async (manager) => {
        await this.sessions.validateWithManager(manager, auth);
        const existing = await manager.getRepository(ConversationEntity).findOneBy({
          directKey,
          type: "DIRECT",
          status: "ACTIVE",
        });
        if (existing) return existing.id;
        const users = await manager
          .getRepository(UserEntity)
          .findBy({ id: In([auth.userId, recipientId]) });
        if (
          users.length !== 2 ||
          users.some((user) => user.status !== "ACTIVE" || user.userType !== "USER")
        ) {
          throw new AppError("CONVERSATION_FORBIDDEN", "Direct conversation is not permitted", 403);
        }
        await this.contacts.assertDirectCreationAllowed(manager, auth.userId, recipientId);
        const now = new Date();
        const conversation = await manager.getRepository(ConversationEntity).save({
          id: uuidv7(),
          type: "DIRECT",
          directKey,
          creatorId: auth.userId,
          ownerId: null,
          title: null,
          avatarAttachmentId: null,
          lastSeq: 0,
          lastMessageId: null,
          lastMessageAt: null,
          memberCount: 2,
          status: "ACTIVE",
          settings: {},
          version: 1,
          deletedAt: null,
        });
        await manager.getRepository(ConversationMemberEntity).insert(
          [auth.userId, recipientId].map((userId) => ({
            conversationId: conversation.id,
            userId,
            role: "MEMBER",
            status: "ACTIVE",
            nickname: null,
            joinedSeq: 0,
            joinedAt: now,
            leftAt: null,
            muteUntil: null,
          })),
        );
        const states = [auth.userId, recipientId].map((userId) =>
          manager.getRepository(ConversationUserStateEntity).create({
            conversationId: conversation.id,
            userId,
            lastDeliveredSeq: 0,
            lastReadSeq: 0,
            clearBeforeSeq: 0,
            unreadCount: 0,
            mentionCount: 0,
            pinnedRank: null,
            muted: false,
            archivedAt: null,
            hiddenAt: null,
          }),
        );
        await manager.getRepository(ConversationUserStateEntity).save(states);
        await this.outbox.append(manager, {
          eventId: uuidv7(),
          eventType: "conversation.created.v1",
          eventVersion: 1,
          occurredAt: now.toISOString(),
          aggregateType: "conversation",
          aggregateId: conversation.id,
          actorUserId: auth.userId,
          audienceUserIds: [auth.userId, recipientId],
          ...trace,
          data: toConversation(conversation, states[0]!, null, null),
        });
        return conversation.id;
      });
      return await this.queries.get(auth.userId, conversationId);
    } catch (error) {
      if (!isDirectUniqueViolation(error)) throw error;
      const existing = await this.dataSource.getRepository(ConversationEntity).findOneBy({
        directKey,
        type: "DIRECT",
        status: "ACTIVE",
      });
      if (!existing) throw error;
      return this.queries.get(auth.userId, existing.id);
    }
  }

  async updateSettings(
    auth: AuthContext,
    conversationId: string,
    input: UpdateConversationSettingsRequest,
    trace: CommandTrace = {},
  ): Promise<Conversation> {
    await this.dataSource.transaction(async (manager) => {
      await this.sessions.validateWithManager(manager, auth);
      const { conversation, state } = await this.lockMembership(
        manager,
        auth.userId,
        conversationId,
      );
      if (input.pinned !== undefined) state.pinnedRank = input.pinned ? Date.now() : null;
      if (input.muted !== undefined) state.muted = input.muted;
      if (input.archived !== undefined) state.archivedAt = input.archived ? new Date() : null;
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
    return this.queries.get(auth.userId, conversationId);
  }

  async hide(auth: AuthContext, conversationId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.sessions.validateWithManager(manager, auth);
      const { state } = await this.lockMembership(manager, auth.userId, conversationId);
      state.hiddenAt = new Date();
      await manager.getRepository(ConversationUserStateEntity).save(state);
    });
  }

  read(
    auth: AuthContext,
    conversationId: string,
    lastReadSeq: number,
    trace: CommandTrace = {},
  ): Promise<Receipt> {
    return this.advanceReceipt(auth, conversationId, "READ", lastReadSeq, trace);
  }

  delivered(
    auth: AuthContext,
    conversationId: string,
    lastDeliveredSeq: number,
    trace: CommandTrace = {},
  ): Promise<Receipt> {
    return this.advanceReceipt(auth, conversationId, "DELIVERED", lastDeliveredSeq, trace);
  }

  private async advanceReceipt(
    auth: AuthContext,
    conversationId: string,
    kind: "DELIVERED" | "READ",
    seq: number,
    trace: CommandTrace,
  ): Promise<Receipt> {
    return this.dataSource.transaction(async (manager) => {
      await this.sessions.validateWithManager(manager, auth);
      const { conversation, state, audience } = await this.lockMembership(
        manager,
        auth.userId,
        conversationId,
      );
      if (seq > conversation.lastSeq) {
        throw new AppError("RECEIPT_SEQ_INVALID", "Receipt sequence exceeds conversation", 400);
      }
      const previousDelivered = state.lastDeliveredSeq;
      const previousRead = state.lastReadSeq;
      state.lastDeliveredSeq = Math.max(state.lastDeliveredSeq, seq);
      if (kind === "READ") {
        state.lastReadSeq = Math.max(state.lastReadSeq, seq);
        state.lastDeliveredSeq = Math.max(state.lastDeliveredSeq, state.lastReadSeq);
        state.unreadCount = await manager
          .getRepository(MessageEntity)
          .createQueryBuilder("message")
          .where("message.conversation_id = :conversationId", { conversationId })
          .andWhere("message.seq > :lastReadSeq", { lastReadSeq: state.lastReadSeq })
          .andWhere("message.sender_id <> :userId", { userId: auth.userId })
          .andWhere("message.counts_unread = true")
          .getCount();
      }
      const changed =
        previousDelivered !== state.lastDeliveredSeq || previousRead !== state.lastReadSeq;
      if (changed) await manager.getRepository(ConversationUserStateEntity).save(state);
      const receipt = receiptFromState(state);
      if (changed) {
        await this.outbox.append(manager, {
          eventId: uuidv7(),
          eventType: "receipt.updated.v1",
          eventVersion: 1,
          occurredAt: receipt.updatedAt,
          aggregateType: "receipt",
          aggregateId: conversation.id,
          actorUserId: auth.userId,
          audienceUserIds: audience,
          ...trace,
          data: receipt,
        });
      }
      return receipt;
    });
  }

  private async lockMembership(
    manager: EntityManager,
    userId: string,
    conversationId: string,
  ): Promise<{
    conversation: ConversationEntity;
    state: ConversationUserStateEntity;
    audience: string[];
  }> {
    const conversation = await manager.getRepository(ConversationEntity).findOne({
      where: { id: conversationId, status: "ACTIVE" },
      lock: { mode: "pessimistic_read" },
    });
    const member = await manager.getRepository(ConversationMemberEntity).findOneBy({
      conversationId,
      userId,
      status: "ACTIVE",
    });
    if (!conversation || !member) {
      throw new AppError("CONVERSATION_NOT_FOUND", "Conversation was not found", 404);
    }
    const state = await manager.getRepository(ConversationUserStateEntity).findOne({
      where: { conversationId, userId },
      lock: { mode: "pessimistic_write" },
    });
    if (!state) throw new AppError("CONVERSATION_NOT_FOUND", "Conversation was not found", 404);
    const members = await manager.getRepository(ConversationMemberEntity).findBy({
      conversationId,
      status: "ACTIVE",
    });
    return { conversation, state, audience: members.map((value) => value.userId) };
  }
}

export function directConversationKey(left: string, right: string): string {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

function receiptFromState(state: ConversationUserStateEntity): Receipt {
  return {
    conversationId: state.conversationId,
    userId: state.userId,
    lastDeliveredSeq: state.lastDeliveredSeq,
    lastReadSeq: state.lastReadSeq,
    updatedAt: state.updatedAt.toISOString(),
  };
}

function isDirectUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505" &&
    "constraint" in error &&
    error.constraint === "conversations_active_direct_uq"
  );
}
