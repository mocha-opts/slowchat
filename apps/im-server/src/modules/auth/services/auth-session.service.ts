import { Inject, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { EntityManager } from "typeorm";
import { DataSource } from "typeorm";

import { AppError } from "../../../common/errors/app-error.js";
import type { ManagedRedis } from "../../../platform/redis/managed-redis.js";
import { RedisKeyFactory } from "../../../platform/redis/redis-key.factory.js";
import { REDIS_REALTIME } from "../../../platform/redis/redis.tokens.js";
import type { AuthContext } from "../auth.types.js";
import { AuthRefreshTokenEntity } from "../persistence/entities/auth-refresh-token.entity.js";
import { AuthSessionEntity } from "../persistence/entities/auth-session.entity.js";
import { DeviceEntity } from "../../devices/persistence/entities/device.entity.js";
import { UserEntity } from "../../users/persistence/entities/user.entity.js";

@Injectable()
export class AuthSessionService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS_REALTIME) private readonly redis: ManagedRedis,
    private readonly keys: RedisKeyFactory,
  ) {}

  async validate(context: AuthContext): Promise<void> {
    const row = await this.dataSource
      .createQueryBuilder()
      .select([
        "s.status AS session_status",
        "s.expires_at AS expires_at",
        "d.status AS device_status",
        "u.status AS user_status",
      ])
      .from(AuthSessionEntity, "s")
      .innerJoin(DeviceEntity, "d", "d.id = s.device_id")
      .innerJoin(UserEntity, "u", "u.id = s.user_id")
      .where("s.id = :sessionId", { sessionId: context.sessionId })
      .andWhere("s.user_id = :userId", { userId: context.userId })
      .andWhere("s.device_id = :deviceId", { deviceId: context.deviceId })
      .getRawOne<{
        session_status: string;
        device_status: string;
        user_status: string;
        expires_at: Date;
      }>();
    if (
      !row ||
      row.session_status !== "ACTIVE" ||
      row.device_status !== "ACTIVE" ||
      row.user_status !== "ACTIVE" ||
      new Date(row.expires_at).getTime() <= Date.now()
    ) {
      throw new AppError("AUTH_SESSION_REVOKED", "Session is no longer active", 401);
    }
  }

  async revokeSession(
    manager: EntityManager,
    sessionId: string,
    reason: string,
  ): Promise<AuthSessionEntity | null> {
    const repository = manager.getRepository(AuthSessionEntity);
    const session = await repository.findOne({ where: { id: sessionId } });
    if (!session) return null;
    if (session.status !== "REVOKED") {
      session.status = "REVOKED";
      session.revokedReason = reason;
      session.revokedAt = new Date();
      await repository.save(session);
      await manager
        .getRepository(AuthRefreshTokenEntity)
        .update({ sessionId: session.id }, { status: "REVOKED" });
    }
    return session;
  }

  async rememberRevocation(sessionId: string, expiresAt: Date): Promise<void> {
    const ttl = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
    await this.redis.client
      .set(this.keys.revokedSession(sessionId), "1", "EX", ttl)
      .catch(() => undefined);
  }
}
