import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type {
  CreateGroupInviteRequest,
  CreateGroupJoinRequest,
  CreateGroupRequest,
  GroupInvite,
  GroupJoinRequest,
  GroupMember,
  GroupProfile,
  UpdateGroupRequest,
} from "@im/contracts/api";
import { DataSource, In, type EntityManager } from "typeorm";
import { v7 as uuidv7 } from "uuid";

import { AppError } from "../../../common/errors/app-error.js";
import type { AuthContext } from "../../auth/auth.types.js";
import { AuthSessionService } from "../../auth/services/auth-session.service.js";
import { UserEntity } from "../../users/persistence/entities/user.entity.js";
import { ConversationEntity } from "../../conversations/persistence/entities/conversation.entity.js";
import { ConversationMemberEntity } from "../../conversations/persistence/entities/conversation-member.entity.js";
import { ConversationUserStateEntity } from "../../conversations/persistence/entities/conversation-user-state.entity.js";
import { ConversationQueryService } from "../../conversations/services/conversation-query.service.js";
import { toConversation } from "../../conversations/conversation.mapper.js";
import { OutboxWriterService } from "../../outbox/services/outbox-writer.service.js";
import { GroupInviteEntity } from "../persistence/entities/group-invite.entity.js";
import { GroupJoinRequestEntity } from "../persistence/entities/group-join-request.entity.js";
import { GroupProfileEntity } from "../persistence/entities/group-profile.entity.js";
import { GroupSystemMessageService } from "./group-system-message.service.js";
import {
  toGroupInvite,
  toGroupJoinRequest,
  toGroupMember,
  toGroupProfile,
} from "../group.mapper.js";

export interface GroupTrace {
  requestId?: string;
  traceId?: string;
}

@Injectable()
export class GroupCommandService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly sessions: AuthSessionService,
    private readonly outbox: OutboxWriterService,
    private readonly systemMessages: GroupSystemMessageService,
    private readonly queries: ConversationQueryService,
  ) {}

  async create(auth: AuthContext, input: CreateGroupRequest, trace: GroupTrace = {}) {
    const conversationId = await this.dataSource.transaction(async (manager) => {
      await this.sessions.validateWithManager(manager, auth);
      const now = new Date();
      const conversation = await manager.getRepository(ConversationEntity).save({
        id: uuidv7(),
        type: "GROUP",
        directKey: null,
        creatorId: auth.userId,
        ownerId: auth.userId,
        title: input.title,
        avatarAttachmentId: null,
        lastSeq: 0,
        lastMessageId: null,
        lastMessageAt: null,
        memberCount: 1,
        status: "ACTIVE",
        settings: {},
        version: 1,
        deletedAt: null,
      });
      await manager.getRepository(GroupProfileEntity).save({
        conversationId: conversation.id,
        title: input.title,
        announcement: input.announcement ?? null,
        maxMembers: input.maxMembers,
        joinMode: input.joinMode,
        allowMemberInvites: input.allowMemberInvites,
        allMembersMuted: false,
        version: 1,
      });
      await manager.getRepository(ConversationMemberEntity).save({
        conversationId: conversation.id,
        userId: auth.userId,
        role: "OWNER",
        status: "ACTIVE",
        nickname: null,
        joinedSeq: 0,
        joinedAt: now,
        leftAt: null,
        muteUntil: null,
      });
      const state = await manager.getRepository(ConversationUserStateEntity).save({
        conversationId: conversation.id,
        userId: auth.userId,
        lastDeliveredSeq: 0,
        lastReadSeq: 0,
        clearBeforeSeq: 0,
        unreadCount: 0,
        mentionCount: 0,
        pinnedRank: null,
        muted: false,
        archivedAt: null,
        hiddenAt: null,
      });
      await this.outbox.append(manager, {
        eventId: uuidv7(),
        eventType: "conversation.created.v1",
        eventVersion: 1,
        occurredAt: now.toISOString(),
        aggregateType: "conversation",
        aggregateId: conversation.id,
        actorUserId: auth.userId,
        audienceUserIds: [auth.userId],
        ...trace,
        data: toConversation(conversation, state, null, null),
      });
      return conversation.id;
    });
    return this.queries.get(auth.userId, conversationId);
  }

  async updateProfile(
    auth: AuthContext,
    conversationId: string,
    input: UpdateGroupRequest,
  ): Promise<GroupProfile> {
    return this.dataSource.transaction(async (manager) => {
      await this.sessions.validateWithManager(manager, auth);
      const { conversation, profile, member } = await this.lockGroup(
        manager,
        auth.userId,
        conversationId,
      );
      this.assertAdmin(member.role);
      Object.assign(profile, {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.announcement !== undefined ? { announcement: input.announcement } : {}),
        ...(input.maxMembers !== undefined ? { maxMembers: input.maxMembers } : {}),
        ...(input.joinMode !== undefined ? { joinMode: input.joinMode } : {}),
        ...(input.allowMemberInvites !== undefined
          ? { allowMemberInvites: input.allowMemberInvites }
          : {}),
        ...(input.allMembersMuted !== undefined ? { allMembersMuted: input.allMembersMuted } : {}),
        version: profile.version + 1,
      });
      await manager.getRepository(GroupProfileEntity).save(profile);
      conversation.title = profile.title;
      conversation.version += 1;
      await manager.getRepository(ConversationEntity).save(conversation);
      await this.systemMessages.append(manager, auth, conversation, "GROUP_UPDATED", null, input);
      return toGroupProfile(profile);
    });
  }

  async invite(
    auth: AuthContext,
    conversationId: string,
    input: CreateGroupInviteRequest,
  ): Promise<GroupInvite> {
    return this.dataSource.transaction(async (manager) => {
      await this.sessions.validateWithManager(manager, auth);
      const { profile, member } = await this.lockGroup(manager, auth.userId, conversationId);
      if (member.role === "MEMBER" && !profile.allowMemberInvites)
        throw new AppError("CONVERSATION_FORBIDDEN", "Member invites are disabled", 403);
      const target = await this.requireActiveUser(manager, input.userId);
      if (target.userType !== "USER" || target.id === auth.userId)
        throw new AppError("CONVERSATION_FORBIDDEN", "User cannot join this group", 403);
      const existing = await manager
        .getRepository(ConversationMemberEntity)
        .findOneBy({ conversationId, userId: input.userId, status: "ACTIVE" });
      if (existing)
        throw new AppError("CONVERSATION_CONFLICT", "User is already a group member", 409);
      const profileMembers = await manager
        .getRepository(ConversationMemberEntity)
        .countBy({ conversationId, status: "ACTIVE" });
      if (profileMembers >= profile.maxMembers)
        throw new AppError("CONVERSATION_CONFLICT", "Group member limit reached", 409);
      const invite = await manager.getRepository(GroupInviteEntity).save({
        id: uuidv7(),
        conversationId,
        inviterId: auth.userId,
        inviteeId: target.id,
        status: "PENDING",
      });
      return toGroupInvite(invite);
    });
  }

  async decideInvite(
    auth: AuthContext,
    inviteId: string,
    decision: "ACCEPTED" | "REJECTED",
  ): Promise<GroupInvite> {
    return this.dataSource.transaction(async (manager) => {
      await this.sessions.validateWithManager(manager, auth);
      const invite = await manager
        .getRepository(GroupInviteEntity)
        .findOne({ where: { id: inviteId }, lock: { mode: "pessimistic_write" } });
      if (!invite || invite.inviteeId !== auth.userId)
        throw new AppError("NOT_FOUND", "Group invite was not found", 404);
      if (invite.status !== "PENDING") return toGroupInvite(invite);
      if (decision === "REJECTED") {
        invite.status = "REJECTED";
        return toGroupInvite(await manager.getRepository(GroupInviteEntity).save(invite));
      }
      const { conversation, profile } = await this.lockGroup(
        manager,
        auth.userId,
        invite.conversationId,
        false,
      );
      const count = await manager
        .getRepository(ConversationMemberEntity)
        .countBy({ conversationId: invite.conversationId, status: "ACTIVE" });
      if (count >= profile.maxMembers)
        throw new AppError("CONVERSATION_CONFLICT", "Group member limit reached", 409);
      const now = new Date();
      await this.addMember(manager, conversation, auth.userId, "MEMBER", now);
      invite.status = "ACCEPTED";
      await manager.getRepository(GroupInviteEntity).save(invite);
      await this.systemMessages.append(
        manager,
        auth,
        conversation,
        "MEMBER_JOINED",
        auth.userId,
        {},
        [auth.userId, ...(await this.activeMemberIds(manager, conversation.id))],
      );
      return toGroupInvite(invite);
    });
  }

  async requestJoin(
    auth: AuthContext,
    conversationId: string,
    input: CreateGroupJoinRequest,
  ): Promise<GroupJoinRequest | GroupMember> {
    return this.dataSource.transaction(async (manager) => {
      await this.sessions.validateWithManager(manager, auth);
      const { conversation, profile } = await this.lockGroup(
        manager,
        auth.userId,
        conversationId,
        false,
      );
      if (profile.joinMode === "INVITE_ONLY")
        throw new AppError("CONVERSATION_FORBIDDEN", "This group requires an invitation", 403);
      const existing = await manager
        .getRepository(ConversationMemberEntity)
        .findOneBy({ conversationId, userId: auth.userId, status: "ACTIVE" });
      if (existing) throw new AppError("CONVERSATION_CONFLICT", "Already a group member", 409);
      const now = new Date();
      if (profile.joinMode === "OPEN") {
        await this.addMember(manager, conversation, auth.userId, "MEMBER", now);
        await this.systemMessages.append(
          manager,
          auth,
          conversation,
          "MEMBER_JOINED",
          auth.userId,
          {},
          [auth.userId, ...(await this.activeMemberIds(manager, conversation.id))],
        );
        const joined = await manager
          .getRepository(ConversationMemberEntity)
          .findOneByOrFail({ conversationId, userId: auth.userId });
        return toGroupMember(joined, await this.requireActiveUser(manager, auth.userId));
      }
      const request = await manager.getRepository(GroupJoinRequestEntity).save({
        id: uuidv7(),
        conversationId,
        userId: auth.userId,
        status: "PENDING",
        message: input.message ?? null,
        reviewerId: null,
      });
      return toGroupJoinRequest(request, await this.requireActiveUser(manager, auth.userId));
    });
  }

  async decideJoinRequest(
    auth: AuthContext,
    requestId: string,
    decision: "APPROVED" | "REJECTED",
  ): Promise<GroupJoinRequest> {
    return this.dataSource.transaction(async (manager) => {
      await this.sessions.validateWithManager(manager, auth);
      const request = await manager
        .getRepository(GroupJoinRequestEntity)
        .findOne({ where: { id: requestId }, lock: { mode: "pessimistic_write" } });
      if (!request) throw new AppError("NOT_FOUND", "Join request was not found", 404);
      const { conversation, profile, member } = await this.lockGroup(
        manager,
        auth.userId,
        request.conversationId,
      );
      this.assertAdmin(member.role);
      if (request.status !== "PENDING")
        return toGroupJoinRequest(request, await this.requireActiveUser(manager, request.userId));
      request.status = decision;
      request.reviewerId = auth.userId;
      if (decision === "APPROVED") {
        const count = await manager
          .getRepository(ConversationMemberEntity)
          .countBy({ conversationId: request.conversationId, status: "ACTIVE" });
        if (count >= profile.maxMembers)
          throw new AppError("CONVERSATION_CONFLICT", "Group member limit reached", 409);
        await this.addMember(manager, conversation, request.userId, "MEMBER", new Date());
        await this.systemMessages.append(
          manager,
          auth,
          conversation,
          "MEMBER_JOINED",
          request.userId,
          {},
          [request.userId, ...(await this.activeMemberIds(manager, conversation.id))],
        );
      }
      const saved = await manager.getRepository(GroupJoinRequestEntity).save(request);
      return toGroupJoinRequest(saved, await this.requireActiveUser(manager, request.userId));
    });
  }

  async remove(auth: AuthContext, conversationId: string, targetUserId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.sessions.validateWithManager(manager, auth);
      const { conversation, member } = await this.lockGroup(manager, auth.userId, conversationId);
      this.assertAdmin(member.role);
      const target = await manager
        .getRepository(ConversationMemberEntity)
        .findOneBy({ conversationId, userId: targetUserId, status: "ACTIVE" });
      if (
        !target ||
        target.role === "OWNER" ||
        (member.role === "ADMIN" && target.role === "ADMIN")
      )
        throw new AppError("CONVERSATION_FORBIDDEN", "Member cannot be removed", 403);
      target.status = "REMOVED";
      target.leftAt = new Date();
      await manager.getRepository(ConversationMemberEntity).save(target);
      await manager
        .getRepository(ConversationEntity)
        .increment({ id: conversationId }, "memberCount", -1);
      await this.systemMessages.append(
        manager,
        auth,
        conversation,
        "MEMBER_REMOVED",
        targetUserId,
        {},
        [targetUserId, ...(await this.activeMemberIds(manager, conversationId))],
      );
    });
  }

  async leave(auth: AuthContext, conversationId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.sessions.validateWithManager(manager, auth);
      const { conversation, member } = await this.lockGroup(manager, auth.userId, conversationId);
      if (member.role === "OWNER")
        throw new AppError(
          "CONVERSATION_FORBIDDEN",
          "Owner must transfer ownership before leaving",
          403,
        );
      member.status = "LEFT";
      member.leftAt = new Date();
      await manager.getRepository(ConversationMemberEntity).save(member);
      await manager
        .getRepository(ConversationEntity)
        .increment({ id: conversationId }, "memberCount", -1);
      await this.systemMessages.append(
        manager,
        auth,
        conversation,
        "MEMBER_LEFT",
        auth.userId,
        {},
        await this.activeMemberIds(manager, conversationId),
      );
    });
  }

  async transferOwner(
    auth: AuthContext,
    conversationId: string,
    targetUserId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.sessions.validateWithManager(manager, auth);
      const { conversation, member } = await this.lockGroup(manager, auth.userId, conversationId);
      if (member.role !== "OWNER")
        throw new AppError("CONVERSATION_FORBIDDEN", "Only the owner can transfer ownership", 403);
      const target = await manager
        .getRepository(ConversationMemberEntity)
        .findOneBy({ conversationId, userId: targetUserId, status: "ACTIVE" });
      if (!target || targetUserId === auth.userId)
        throw new AppError("CONVERSATION_FORBIDDEN", "Target must be an active member", 403);
      member.role = "ADMIN";
      target.role = "OWNER";
      conversation.ownerId = targetUserId;
      conversation.version += 1;
      await manager.getRepository(ConversationMemberEntity).save([member, target]);
      await manager.getRepository(ConversationEntity).save(conversation);
      await this.systemMessages.append(
        manager,
        auth,
        conversation,
        "OWNER_TRANSFERRED",
        targetUserId,
        {},
        await this.activeMemberIds(manager, conversationId),
      );
    });
  }

  async disband(auth: AuthContext, conversationId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.sessions.validateWithManager(manager, auth);
      const { conversation, member } = await this.lockGroup(manager, auth.userId, conversationId);
      if (member.role !== "OWNER")
        throw new AppError("CONVERSATION_FORBIDDEN", "Only the owner can disband a group", 403);
      const audience = await this.activeMemberIds(manager, conversationId);
      await this.systemMessages.append(
        manager,
        auth,
        conversation,
        "GROUP_DISBANDED",
        null,
        {},
        audience,
      );
      await manager
        .getRepository(ConversationMemberEntity)
        .update({ conversationId, status: "ACTIVE" }, { status: "REMOVED", leftAt: new Date() });
      conversation.status = "DELETED";
      conversation.deletedAt = new Date();
      await manager.getRepository(ConversationEntity).save(conversation);
    });
  }

  async updateMember(
    auth: AuthContext,
    conversationId: string,
    targetUserId: string,
    role: string | undefined,
    muteUntil: Date | null | undefined,
  ): Promise<GroupMember> {
    return this.dataSource.transaction(async (manager) => {
      await this.sessions.validateWithManager(manager, auth);
      const { conversation, member } = await this.lockGroup(manager, auth.userId, conversationId);
      const target = await manager
        .getRepository(ConversationMemberEntity)
        .findOneBy({ conversationId, userId: targetUserId, status: "ACTIVE" });
      if (!target) throw new AppError("NOT_FOUND", "Group member was not found", 404);
      if (role !== undefined) {
        if (member.role !== "OWNER" || target.role === "OWNER")
          throw new AppError("CONVERSATION_FORBIDDEN", "Only owner can change administrators", 403);
        target.role = role;
      }
      if (muteUntil !== undefined) {
        if (member.role === "MEMBER" || target.role === "OWNER")
          throw new AppError("CONVERSATION_FORBIDDEN", "Member cannot be muted", 403);
        target.muteUntil = muteUntil;
      }
      await manager.getRepository(ConversationMemberEntity).save(target);
      await this.systemMessages.append(
        manager,
        auth,
        conversation,
        role !== undefined ? "ADMIN_UPDATED" : "MUTE_UPDATED",
        targetUserId,
        { role: target.role, muteUntil: target.muteUntil?.toISOString() ?? null },
        await this.activeMemberIds(manager, conversationId),
      );
      return this.hydrateMember(manager, target);
    });
  }

  async listJoinRequests(
    auth: AuthContext,
    conversationId: string,
    cursorInput: string | undefined,
    limit: number,
    status: string | undefined,
  ) {
    return this.dataSource.transaction(async (manager) => {
      await this.sessions.validateWithManager(manager, auth);
      const { member } = await this.lockGroup(manager, auth.userId, conversationId);
      this.assertAdmin(member.role);
      const cursor = decodeRequestCursor(cursorInput);
      const builder = manager
        .getRepository(GroupJoinRequestEntity)
        .createQueryBuilder("request")
        .where("request.conversation_id = :conversationId", { conversationId });
      if (status) builder.andWhere("request.status = :status", { status });
      if (cursor) builder.andWhere("(request.created_at, request.id) < (:createdAt, :id)", cursor);
      const rows = await builder
        .orderBy("request.created_at", "DESC")
        .addOrderBy("request.id", "DESC")
        .take(limit + 1)
        .getMany();
      const selected = rows.slice(0, limit);
      const users = await manager.getRepository(UserEntity).findBy({
        id: In(selected.map((row) => row.userId)),
      });
      const userMap = new Map(users.map((user) => [user.id, user]));
      const items = selected.map((row) => {
        const user = userMap.get(row.userId);
        if (!user) throw new AppError("INTERNAL_ERROR", "Join request user is missing", 500);
        return toGroupJoinRequest(row, user);
      });
      const last = selected.at(-1);
      const hasMore = rows.length > limit;
      return {
        items,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeRequestCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
            : null,
      };
    });
  }

  private async lockGroup(
    manager: EntityManager,
    userId: string,
    conversationId: string,
    requireMember = true,
  ) {
    const conversation = await manager.getRepository(ConversationEntity).findOne({
      where: { id: conversationId, type: "GROUP", status: "ACTIVE" },
      lock: { mode: "pessimistic_read" },
    });
    const profile = await manager.getRepository(GroupProfileEntity).findOneBy({ conversationId });
    const member = await manager
      .getRepository(ConversationMemberEntity)
      .findOneBy({ conversationId, userId, status: "ACTIVE" });
    if (!conversation || !profile || (requireMember && !member))
      throw new AppError("CONVERSATION_NOT_FOUND", "Group was not found", 404);
    if (requireMember && !member)
      throw new AppError("CONVERSATION_FORBIDDEN", "Group membership is required", 403);
    return { conversation, profile, member: member! };
  }

  private async addMember(
    manager: EntityManager,
    conversation: ConversationEntity,
    userId: string,
    role: string,
    joinedAt: Date,
  ): Promise<void> {
    await manager.getRepository(ConversationMemberEntity).save({
      conversationId: conversation.id,
      userId,
      role,
      status: "ACTIVE",
      nickname: null,
      joinedSeq: conversation.lastSeq,
      joinedAt,
      leftAt: null,
      muteUntil: null,
    });
    await manager.getRepository(ConversationUserStateEntity).upsert(
      {
        conversationId: conversation.id,
        userId,
        lastDeliveredSeq: conversation.lastSeq,
        lastReadSeq: conversation.lastSeq,
        clearBeforeSeq: 0,
        unreadCount: 0,
        mentionCount: 0,
        pinnedRank: null,
        muted: false,
        archivedAt: null,
        hiddenAt: null,
      },
      ["conversationId", "userId"],
    );
    conversation.memberCount += 1;
    await manager.getRepository(ConversationEntity).save(conversation);
  }

  private activeMemberIds(manager: EntityManager, conversationId: string): Promise<string[]> {
    return manager
      .getRepository(ConversationMemberEntity)
      .findBy({ conversationId, status: "ACTIVE" })
      .then((members) => members.map((member) => member.userId));
  }

  private async requireActiveUser(manager: EntityManager, userId: string): Promise<UserEntity> {
    const user = await manager
      .getRepository(UserEntity)
      .findOneBy({ id: userId, status: "ACTIVE" });
    if (!user) throw new AppError("NOT_FOUND", "User was not found", 404);
    return user;
  }

  private assertAdmin(role: string): void {
    if (role !== "OWNER" && role !== "ADMIN")
      throw new AppError("CONVERSATION_FORBIDDEN", "Administrator permission is required", 403);
  }

  private async hydrateMember(
    manager: EntityManager,
    member: ConversationMemberEntity,
  ): Promise<GroupMember> {
    return toGroupMember(member, await this.requireActiveUser(manager, member.userId));
  }
}

interface RequestCursor {
  createdAt: string;
  id: string;
}

function encodeRequestCursor(value: RequestCursor): string {
  return Buffer.from(JSON.stringify({ v: 1, ...value }), "utf8").toString("base64url");
}

function decodeRequestCursor(value: string | undefined): RequestCursor | null {
  if (!value) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    if (
      decoded.v !== 1 ||
      typeof decoded.createdAt !== "string" ||
      Number.isNaN(Date.parse(decoded.createdAt)) ||
      typeof decoded.id !== "string"
    )
      throw new Error("invalid cursor");
    return { createdAt: decoded.createdAt, id: decoded.id };
  } catch {
    throw new AppError("VALIDATION_ERROR", "Cursor is invalid", 400);
  }
}
