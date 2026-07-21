import { Inject, Injectable } from "@nestjs/common";

import { AppError } from "../../../common/errors/app-error.js";
import type { ManagedRedis } from "../../../platform/redis/managed-redis.js";
import { RedisKeyFactory } from "../../../platform/redis/redis-key.factory.js";
import { REDIS_REALTIME } from "../../../platform/redis/redis.tokens.js";
import { APP_CONFIG, type AppConfig } from "../../../platform/config/app-config.js";

@Injectable()
export class AuthRateLimiterService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(REDIS_REALTIME) private readonly redis: ManagedRedis,
    private readonly keys: RedisKeyFactory,
  ) {}

  async assertChallengeAllowed(identityHash: string, ipHash: string): Promise<void> {
    const cooldownKey = this.keys.authRate("challenge-cooldown", identityHash);
    try {
      const acquired = await this.redis.client.set(
        cooldownKey,
        "1",
        "EX",
        this.config.auth.challengeResendSeconds,
        "NX",
      );
      if (!acquired) throw this.rateLimited();
      await Promise.all([
        this.consume(this.keys.authRate("challenge", identityHash), 5, 3_600),
        this.consume(
          this.keys.authRate("ip", ipHash),
          this.config.auth.loginIpLimit,
          this.config.auth.loginWindowSeconds,
        ),
      ]);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("SERVICE_UNAVAILABLE", "Authentication rate limiter is unavailable", 503);
    }
  }

  async assertLoginAllowed(identityHash: string, ipHash: string): Promise<void> {
    await Promise.all([
      this.check(this.keys.authRate("identity", identityHash), this.config.auth.loginIdentityLimit),
      this.check(this.keys.authRate("ip", ipHash), this.config.auth.loginIpLimit),
    ]);
  }

  async recordLoginFailure(identityHash: string, ipHash: string): Promise<void> {
    await Promise.all([
      this.consume(
        this.keys.authRate("identity", identityHash),
        this.config.auth.loginIdentityLimit,
        this.config.auth.loginWindowSeconds,
      ),
      this.consume(
        this.keys.authRate("ip", ipHash),
        this.config.auth.loginIpLimit,
        this.config.auth.loginWindowSeconds,
      ),
    ]);
  }

  async clearLoginFailures(identityHash: string): Promise<void> {
    await this.redis.client.del(this.keys.authRate("identity", identityHash));
  }

  private async check(key: string, limit: number): Promise<void> {
    try {
      const count = Number((await this.redis.client.get(key)) ?? 0);
      if (count >= limit) throw this.rateLimited();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("SERVICE_UNAVAILABLE", "Authentication rate limiter is unavailable", 503);
    }
  }

  private async consume(key: string, limit: number, ttlSeconds: number): Promise<void> {
    try {
      const count = await this.redis.client.incr(key);
      if (count === 1) await this.redis.client.expire(key, ttlSeconds);
      if (count > limit) throw this.rateLimited();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("SERVICE_UNAVAILABLE", "Authentication rate limiter is unavailable", 503);
    }
  }

  private rateLimited(): AppError {
    return new AppError("RATE_LIMITED", "Too many authentication attempts", 429);
  }
}
