import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { CreateReportRequest } from "@im/contracts/api";
import { DataSource, type EntityManager } from "typeorm";
import { v7 as uuidv7 } from "uuid";

import { AppError } from "../../../common/errors/app-error.js";
import { decodeCursor, encodeCursor } from "../../../common/pagination/cursor-codec.js";
import { RealtimeEventPublisherService } from "../../../platform/realtime/realtime-event-publisher.service.js";
import { UserPrivacySettingsEntity } from "../../users/persistence/entities/user-privacy-settings.entity.js";
import { UserEntity } from "../../users/persistence/entities/user.entity.js";
import { toPublicUser } from "../../users/user.mapper.js";
import { BlockEntity } from "../persistence/entities/block.entity.js";
import { FriendRequestEntity } from "../persistence/entities/friend-request.entity.js";
import { FriendshipEntity } from "../persistence/entities/friendship.entity.js";
import { ReportEntity } from "../persistence/entities/report.entity.js";

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

@Injectable()
export class ContactService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly realtime: RealtimeEventPublisherService,
  ) {}

  async createFriendRequest(
    requesterId: string,
    recipientId: string,
    message?: string,
  ): Promise<FriendRequestEntity> {
    if (requesterId === recipientId) {
      throw new AppError("FRIEND_REQUEST_CONFLICT", "Cannot send a request to yourself", 409);
    }
    const request = await this.dataSource.transaction(async (manager) => {
      await this.requireActiveUser(manager, recipientId);
      await this.assertUsersMayInteract(manager, requesterId, recipientId);
      if (
        await manager
          .getRepository(FriendshipEntity)
          .existsBy({ userId: requesterId, contactUserId: recipientId })
      ) {
        throw new AppError("FRIEND_REQUEST_CONFLICT", "Users are already contacts", 409);
      }
      const privacy = await manager
        .getRepository(UserPrivacySettingsEntity)
        .findOneBy({ userId: recipientId });
      if (!privacy || privacy.friendRequestAudience === "NOBODY") {
        throw new AppError("PRIVACY_RESTRICTED", "The user does not accept friend requests", 403);
      }
      if (privacy.friendRequestAudience === "CONTACTS") {
        const mutual = await this.haveMutualContact(manager, requesterId, recipientId);
        if (!mutual)
          throw new AppError("PRIVACY_RESTRICTED", "Friend request is not permitted", 403);
      }
      const [pairLow, pairHigh] = this.pair(requesterId, recipientId);
      const pending = await manager.getRepository(FriendRequestEntity).findOneBy({
        pairLow,
        pairHigh,
        status: "PENDING",
      });
      if (pending)
        throw new AppError("FRIEND_REQUEST_CONFLICT", "A request is already pending", 409);
      return manager.getRepository(FriendRequestEntity).save({
        id: uuidv7(),
        requesterId,
        recipientId,
        pairLow,
        pairHigh,
        status: "PENDING",
        message: message ?? null,
      });
    });
    await this.emit(request.recipientId, "friend-request.updated", {
      requestId: request.id,
      status: request.status,
    });
    return request;
  }

  async decideFriendRequest(
    userId: string,
    requestId: string,
    decision: "ACCEPTED" | "REJECTED",
  ): Promise<FriendRequestEntity> {
    const request = await this.dataSource.transaction(async (manager) => {
      const value = await manager.getRepository(FriendRequestEntity).findOne({
        where: { id: requestId },
        lock: { mode: "pessimistic_write" },
      });
      if (!value || value.recipientId !== userId)
        throw new AppError("NOT_FOUND", "Friend request was not found", 404);
      if (value.status === decision) return value;
      if (value.status !== "PENDING")
        throw new AppError("FRIEND_REQUEST_CONFLICT", "Friend request is no longer pending", 409);
      await this.assertUsersMayInteract(manager, value.requesterId, value.recipientId);
      value.status = decision;
      await manager.getRepository(FriendRequestEntity).save(value);
      if (decision === "ACCEPTED") {
        await manager.getRepository(FriendshipEntity).upsert(
          [
            { userId: value.requesterId, contactUserId: value.recipientId, remark: null },
            { userId: value.recipientId, contactUserId: value.requesterId, remark: null },
          ],
          ["userId", "contactUserId"],
        );
      }
      return value;
    });
    await Promise.all([
      this.emit(request.requesterId, "friend-request.updated", {
        requestId,
        status: request.status,
      }),
      this.emit(request.recipientId, "friend-request.updated", {
        requestId,
        status: request.status,
      }),
      ...(decision === "ACCEPTED"
        ? [
            this.emit(request.requesterId, "contact.updated", {
              userId: request.recipientId,
              action: "ADDED",
            }),
            this.emit(request.recipientId, "contact.updated", {
              userId: request.requesterId,
              action: "ADDED",
            }),
          ]
        : []),
    ]);
    return request;
  }

  async listFriendRequests(
    userId: string,
    direction: "INCOMING" | "OUTGOING",
    cursorInput: string | undefined,
    limit: number,
  ): Promise<Page<ReturnType<ContactService["mapRequest"]>>> {
    const cursor = decodeCursor(cursorInput);
    const column = direction === "INCOMING" ? "recipient_id" : "requester_id";
    const builder = this.dataSource
      .getRepository(FriendRequestEntity)
      .createQueryBuilder("r")
      .where(`r.${column} = :userId`, { userId });
    if (cursor)
      builder.andWhere("(r.created_at, r.id) < (:createdAt, :id)", {
        createdAt: cursor.createdAt,
        id: cursor.id,
      });
    const rows = await builder
      .orderBy("r.created_at", "DESC")
      .addOrderBy("r.id", "DESC")
      .take(limit + 1)
      .getMany();
    return this.page(
      rows,
      limit,
      (row) => this.mapRequest(row),
      (row) => row.id,
    );
  }

  async listContacts(
    userId: string,
    cursorInput: string | undefined,
    limit: number,
  ): Promise<Page<unknown>> {
    const cursor = decodeCursor(cursorInput);
    const builder = this.dataSource
      .getRepository(FriendshipEntity)
      .createQueryBuilder("f")
      .where("f.user_id = :userId", { userId });
    if (cursor)
      builder.andWhere("(f.created_at, f.contact_user_id) < (:createdAt, :id)", {
        createdAt: cursor.createdAt,
        id: cursor.id,
      });
    const rows = await builder
      .orderBy("f.created_at", "DESC")
      .addOrderBy("f.contact_user_id", "DESC")
      .take(limit + 1)
      .getMany();
    const users = await this.usersById(rows.map((row) => row.contactUserId));
    return this.page(
      rows,
      limit,
      (row) => ({
        user: toPublicUser(users.get(row.contactUserId)!),
        remark: row.remark,
        createdAt: row.createdAt.toISOString(),
      }),
      (row) => row.contactUserId,
    );
  }

  async updateContact(userId: string, contactUserId: string, remark: string | null): Promise<void> {
    const result = await this.dataSource
      .getRepository(FriendshipEntity)
      .update({ userId, contactUserId }, { remark });
    if (!result.affected) throw new AppError("NOT_FOUND", "Contact was not found", 404);
    await this.emit(userId, "contact.updated", { userId: contactUserId, action: "UPDATED" });
  }

  async deleteContact(userId: string, contactUserId: string): Promise<void> {
    const removed = await this.dataSource.transaction(async (manager) => {
      const exists = await manager
        .getRepository(FriendshipEntity)
        .existsBy({ userId, contactUserId });
      if (!exists) return false;
      await manager
        .createQueryBuilder()
        .delete()
        .from(FriendshipEntity)
        .where(
          "(user_id = :userId AND contact_user_id = :contactUserId) OR (user_id = :contactUserId AND contact_user_id = :userId)",
          { userId, contactUserId },
        )
        .execute();
      return true;
    });
    if (!removed) throw new AppError("NOT_FOUND", "Contact was not found", 404);
    await Promise.all([
      this.emit(userId, "contact.updated", { userId: contactUserId, action: "REMOVED" }),
      this.emit(contactUserId, "contact.updated", { userId, action: "REMOVED" }),
    ]);
  }

  async block(userId: string, blockedUserId: string): Promise<void> {
    if (userId === blockedUserId)
      throw new AppError("BLOCK_CONFLICT", "Cannot block yourself", 409);
    await this.dataSource.transaction(async (manager) => {
      await this.requireActiveUser(manager, blockedUserId);
      await manager
        .getRepository(BlockEntity)
        .upsert({ userId, blockedUserId }, ["userId", "blockedUserId"]);
      await manager
        .createQueryBuilder()
        .delete()
        .from(FriendshipEntity)
        .where(
          "(user_id = :userId AND contact_user_id = :blockedUserId) OR (user_id = :blockedUserId AND contact_user_id = :userId)",
          { userId, blockedUserId },
        )
        .execute();
      const [pairLow, pairHigh] = this.pair(userId, blockedUserId);
      await manager
        .getRepository(FriendRequestEntity)
        .update({ pairLow, pairHigh, status: "PENDING" }, { status: "CANCELLED" });
    });
    await Promise.all([
      this.emit(userId, "block.updated", { userId: blockedUserId, action: "ADDED" }),
      this.emit(blockedUserId, "contact.updated", { userId, action: "REMOVED" }),
    ]);
  }

  async unblock(userId: string, blockedUserId: string): Promise<void> {
    await this.dataSource.getRepository(BlockEntity).delete({ userId, blockedUserId });
    await this.emit(userId, "block.updated", { userId: blockedUserId, action: "REMOVED" });
  }

  async listBlocks(
    userId: string,
    cursorInput: string | undefined,
    limit: number,
  ): Promise<Page<unknown>> {
    const cursor = decodeCursor(cursorInput);
    const builder = this.dataSource
      .getRepository(BlockEntity)
      .createQueryBuilder("b")
      .where("b.user_id = :userId", { userId });
    if (cursor)
      builder.andWhere("(b.created_at, b.blocked_user_id) < (:createdAt, :id)", {
        createdAt: cursor.createdAt,
        id: cursor.id,
      });
    const rows = await builder
      .orderBy("b.created_at", "DESC")
      .addOrderBy("b.blocked_user_id", "DESC")
      .take(limit + 1)
      .getMany();
    const users = await this.usersById(rows.map((row) => row.blockedUserId));
    return this.page(
      rows,
      limit,
      (row) => ({
        user: toPublicUser(users.get(row.blockedUserId)!),
        createdAt: row.createdAt.toISOString(),
      }),
      (row) => row.blockedUserId,
    );
  }

  async report(reporterId: string, input: CreateReportRequest): Promise<void> {
    if (reporterId === input.userId)
      throw new AppError("VALIDATION_ERROR", "Cannot report yourself", 400);
    await this.requireActiveUser(this.dataSource.manager, input.userId);
    await this.dataSource.getRepository(ReportEntity).save({
      id: uuidv7(),
      reporterId,
      targetUserId: input.userId,
      category: input.category,
      description: input.description,
      status: "OPEN",
    });
  }

  private async assertUsersMayInteract(
    manager: EntityManager,
    left: string,
    right: string,
  ): Promise<void> {
    const blocked = await manager.getRepository(BlockEntity).exists({
      where: [
        { userId: left, blockedUserId: right },
        { userId: right, blockedUserId: left },
      ],
    });
    if (blocked) throw new AppError("USER_BLOCKED", "Interaction is blocked", 403);
  }

  private async haveMutualContact(
    manager: EntityManager,
    left: string,
    right: string,
  ): Promise<boolean> {
    const row = await manager
      .getRepository(FriendshipEntity)
      .createQueryBuilder("a")
      .innerJoin(
        FriendshipEntity,
        "b",
        "b.user_id = :right AND b.contact_user_id = a.contact_user_id",
        { right },
      )
      .where("a.user_id = :left", { left })
      .getOne();
    return Boolean(row);
  }

  private async requireActiveUser(manager: EntityManager, userId: string): Promise<UserEntity> {
    const user = await manager
      .getRepository(UserEntity)
      .findOneBy({ id: userId, status: "ACTIVE" });
    if (!user) throw new AppError("NOT_FOUND", "User was not found", 404);
    return user;
  }

  private async usersById(ids: string[]): Promise<Map<string, UserEntity>> {
    if (ids.length === 0) return new Map();
    const users = await this.dataSource
      .getRepository(UserEntity)
      .createQueryBuilder("u")
      .where("u.id IN (:...ids)", { ids })
      .getMany();
    return new Map(users.map((user) => [user.id, user]));
  }

  private page<T extends { createdAt: Date }, R>(
    rows: T[],
    limit: number,
    map: (row: T) => R,
    id: (row: T) => string,
  ): Page<R> {
    const hasMore = rows.length > limit;
    const selected = rows.slice(0, limit);
    const last = selected.at(-1);
    return {
      items: selected.map(map),
      hasMore,
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, id(last)) : null,
    };
  }

  private mapRequest(request: FriendRequestEntity) {
    return {
      id: request.id,
      requesterId: request.requesterId,
      recipientId: request.recipientId,
      status: request.status,
      message: request.message,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    };
  }

  private pair(left: string, right: string): [string, string] {
    return left < right ? [left, right] : [right, left];
  }

  private async emit(userId: string, event: string, data: unknown): Promise<void> {
    await this.realtime.emitToUser(event, userId, data).catch(() => undefined);
  }
}
