import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type {
  CurrentUser,
  PrivacySettings,
  PublicUser,
  UpdatePrivacySettingsRequest,
  UpdateCurrentUserRequest,
} from "@im/contracts/api";
import { DataSource } from "typeorm";

import { decodeCursor, encodeCursor } from "../../../common/pagination/cursor-codec.js";
import { AppError } from "../../../common/errors/app-error.js";
import { RealtimeEventPublisherService } from "../../../platform/realtime/realtime-event-publisher.service.js";
import type { AuthContext } from "../../auth/auth.types.js";
import { AuthSessionEntity } from "../../auth/persistence/entities/auth-session.entity.js";
import { AuthRefreshTokenEntity } from "../../auth/persistence/entities/auth-refresh-token.entity.js";
import { PasswordService } from "../../auth/services/password.service.js";
import { DeviceEntity } from "../../devices/persistence/entities/device.entity.js";
import { BlockEntity } from "../../contacts/persistence/entities/block.entity.js";
import { FriendRequestEntity } from "../../contacts/persistence/entities/friend-request.entity.js";
import { FriendshipEntity } from "../../contacts/persistence/entities/friendship.entity.js";
import { toCurrentUser, toPublicUser } from "../user.mapper.js";
import { UserCredentialEntity } from "../persistence/entities/user-credential.entity.js";
import { UserPrivacySettingsEntity } from "../persistence/entities/user-privacy-settings.entity.js";
import { UserEntity } from "../persistence/entities/user.entity.js";

@Injectable()
export class UserService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly passwords: PasswordService,
    private readonly realtime: RealtimeEventPublisherService,
  ) {}

  async getCurrent(userId: string): Promise<CurrentUser> {
    const user = await this.requireUser(userId);
    return toCurrentUser(user);
  }

  async getPublic(viewerId: string, userId: string): Promise<PublicUser> {
    const user = await this.requireActiveUser(userId);
    if (await this.isBlockedEitherDirection(viewerId, userId)) {
      throw new AppError("NOT_FOUND", "User was not found", 404);
    }
    return toPublicUser(user);
  }

  async updateCurrent(userId: string, input: UpdateCurrentUserRequest): Promise<CurrentUser> {
    const user = await this.requireUser(userId);
    if (input.username && input.username !== user.usernameNormalized) {
      const duplicate = await this.dataSource.getRepository(UserEntity).findOneBy({
        usernameNormalized: input.username,
      });
      if (duplicate) throw new AppError("USERNAME_TAKEN", "Username is already in use", 409);
      user.username = input.username;
      user.usernameNormalized = input.username;
    }
    if (input.nickname !== undefined) user.nickname = input.nickname;
    if (input.avatarUrl !== undefined) user.avatarUrl = input.avatarUrl;
    if (input.signature !== undefined) user.signature = input.signature;
    if (input.region !== undefined) user.region = input.region;
    if (input.extensions !== undefined) user.extensions = input.extensions;
    user.version += 1;
    return toCurrentUser(await this.dataSource.getRepository(UserEntity).save(user));
  }

  async deleteCurrent(context: AuthContext, password: string): Promise<void> {
    const credential = await this.dataSource.getRepository(UserCredentialEntity).findOneBy({
      userId: context.userId,
    });
    if (
      !credential?.passwordHash ||
      !(await this.passwords.verify(credential.passwordHash, password))
    ) {
      throw new AppError("AUTH_INVALID_CREDENTIALS", "Invalid credentials", 401);
    }
    const revoked = await this.dataSource.transaction(async (manager) => {
      const user = await manager.getRepository(UserEntity).findOne({
        where: { id: context.userId },
        lock: { mode: "pessimistic_write" },
      });
      if (!user) throw new AppError("NOT_FOUND", "User was not found", 404);
      const sessions = await manager.getRepository(AuthSessionEntity).findBy({
        userId: context.userId,
        status: "ACTIVE",
      });
      await manager
        .getRepository(AuthSessionEntity)
        .update(
          { userId: context.userId, status: "ACTIVE" },
          { status: "REVOKED", revokedReason: "ACCOUNT_DELETED", revokedAt: new Date() },
        );
      await manager
        .createQueryBuilder()
        .update(AuthRefreshTokenEntity)
        .set({ status: "REVOKED" })
        .where("session_id IN (SELECT id FROM auth_sessions WHERE user_id = :userId)", {
          userId: context.userId,
        })
        .execute();
      await manager
        .getRepository(DeviceEntity)
        .update(
          { userId: context.userId, status: "ACTIVE" },
          { status: "REVOKED", revokedAt: new Date() },
        );
      await manager
        .createQueryBuilder()
        .delete()
        .from(FriendshipEntity)
        .where("user_id = :userId OR contact_user_id = :userId", { userId: context.userId })
        .execute();
      await manager
        .createQueryBuilder()
        .delete()
        .from(FriendRequestEntity)
        .where("requester_id = :userId OR recipient_id = :userId", { userId: context.userId })
        .execute();
      await manager
        .createQueryBuilder()
        .delete()
        .from(BlockEntity)
        .where("user_id = :userId OR blocked_user_id = :userId", { userId: context.userId })
        .execute();
      await manager.getRepository(UserCredentialEntity).delete({ userId: context.userId });
      user.status = "DELETED";
      const tombstoneUsername = `deleted_${user.id.replaceAll("-", "").slice(0, 24)}`;
      user.username = tombstoneUsername;
      user.usernameNormalized = tombstoneUsername;
      user.nickname = "Deleted User";
      user.avatarUrl = null;
      user.signature = null;
      user.region = null;
      user.extensions = {};
      user.lastOnlineAt = null;
      user.deletedAt = new Date();
      user.version += 1;
      await manager.getRepository(UserEntity).save(user);
      return sessions;
    });
    await Promise.all(
      revoked.map((session) =>
        this.realtime
          .revokeSession({
            sessionId: session.id,
            deviceId: session.deviceId,
            reason: "ACCOUNT_DELETED",
          })
          .catch(() => undefined),
      ),
    );
  }

  async search(
    viewerId: string,
    query: string,
    cursorInput: string | undefined,
    limit: number,
  ): Promise<{ items: PublicUser[]; nextCursor: string | null; hasMore: boolean }> {
    const cursor = decodeCursor(cursorInput);
    const builder = this.dataSource
      .getRepository(UserEntity)
      .createQueryBuilder("u")
      .innerJoin(UserPrivacySettingsEntity, "p", "p.user_id = u.id")
      .where("u.status = 'ACTIVE'")
      .andWhere("(u.username_normalized LIKE :query OR lower(u.nickname) LIKE :query)", {
        query: `${query.toLowerCase()}%`,
      })
      .andWhere(
        `(p.search_audience = 'EVERYONE' OR u.id = :viewerId OR
          (p.search_audience = 'CONTACTS' AND EXISTS (
            SELECT 1 FROM friendships f WHERE f.user_id = u.id AND f.contact_user_id = :viewerId
          )))`,
        { viewerId },
      )
      .andWhere(
        `NOT EXISTS (SELECT 1 FROM blocks b
          WHERE (b.user_id = :viewerId AND b.blocked_user_id = u.id)
             OR (b.user_id = u.id AND b.blocked_user_id = :viewerId))`,
        { viewerId },
      );
    if (cursor) {
      builder.andWhere("(u.created_at, u.id) < (:createdAt, :cursorId)", {
        createdAt: cursor.createdAt,
        cursorId: cursor.id,
      });
    }
    const rows = await builder
      .orderBy("u.created_at", "DESC")
      .addOrderBy("u.id", "DESC")
      .take(limit + 1)
      .getMany();
    const hasMore = rows.length > limit;
    const selected = rows.slice(0, limit);
    const last = selected.at(-1);
    return {
      items: selected.map(toPublicUser),
      hasMore,
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async getPrivacy(userId: string): Promise<PrivacySettings> {
    const value = await this.dataSource
      .getRepository(UserPrivacySettingsEntity)
      .findOneBy({ userId });
    if (!value) throw new AppError("NOT_FOUND", "Privacy settings were not found", 404);
    return this.mapPrivacy(value);
  }

  async updatePrivacy(
    userId: string,
    input: UpdatePrivacySettingsRequest,
  ): Promise<PrivacySettings> {
    const repository = this.dataSource.getRepository(UserPrivacySettingsEntity);
    const value = await repository.findOneBy({ userId });
    if (!value) throw new AppError("NOT_FOUND", "Privacy settings were not found", 404);
    Object.assign(value, input);
    return this.mapPrivacy(await repository.save(value));
  }

  private mapPrivacy(value: UserPrivacySettingsEntity): PrivacySettings {
    return {
      searchAudience: value.searchAudience as PrivacySettings["searchAudience"],
      friendRequestAudience:
        value.friendRequestAudience as PrivacySettings["friendRequestAudience"],
      groupInviteAudience: value.groupInviteAudience as PrivacySettings["groupInviteAudience"],
      onlineStatusAudience: value.onlineStatusAudience as PrivacySettings["onlineStatusAudience"],
      lastSeenAudience: value.lastSeenAudience as PrivacySettings["lastSeenAudience"],
      allowStrangerMessages: value.allowStrangerMessages,
      allowBotDirectMessages: value.allowBotDirectMessages,
    };
  }

  private async requireUser(userId: string): Promise<UserEntity> {
    const user = await this.dataSource.getRepository(UserEntity).findOneBy({ id: userId });
    if (!user) throw new AppError("NOT_FOUND", "User was not found", 404);
    return user;
  }

  private async requireActiveUser(userId: string): Promise<UserEntity> {
    const user = await this.requireUser(userId);
    if (user.status !== "ACTIVE") throw new AppError("NOT_FOUND", "User was not found", 404);
    return user;
  }

  private async isBlockedEitherDirection(left: string, right: string): Promise<boolean> {
    return this.dataSource.getRepository(BlockEntity).exists({
      where: [
        { userId: left, blockedUserId: right },
        { userId: right, blockedUserId: left },
      ],
    });
  }
}
