import { randomInt } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type {
  DeviceInput,
  Identity,
  LoginRequest,
  RegisterRequest,
  TokenResponse,
} from "@im/contracts/api";
import { DataSource, type EntityManager } from "typeorm";
import { v7 as uuidv7 } from "uuid";
import { PinoLogger } from "nestjs-pino";

import { AppError } from "../../../common/errors/app-error.js";
import { APP_CONFIG, type AppConfig } from "../../../platform/config/app-config.js";
import { RealtimeEventPublisherService } from "../../../platform/realtime/realtime-event-publisher.service.js";
import { toDevice, toSession } from "../../devices/device.mapper.js";
import { DeviceEntity } from "../../devices/persistence/entities/device.entity.js";
import { toCurrentUser } from "../../users/user.mapper.js";
import { UserCredentialEntity } from "../../users/persistence/entities/user-credential.entity.js";
import { UserPrivacySettingsEntity } from "../../users/persistence/entities/user-privacy-settings.entity.js";
import { UserEntity } from "../../users/persistence/entities/user.entity.js";
import type { AuthContext, RequestMetadata } from "../auth.types.js";
import {
  AUTH_NOTIFICATION_PORT,
  type AuthNotificationPort,
} from "../notifications/auth-notification.port.js";
import { AuthChallengeEntity } from "../persistence/entities/auth-challenge.entity.js";
import { AuthLoginAttemptEntity } from "../persistence/entities/auth-login-attempt.entity.js";
import { AuthRefreshTokenEntity } from "../persistence/entities/auth-refresh-token.entity.js";
import { AuthSessionEntity } from "../persistence/entities/auth-session.entity.js";
import { AuthRateLimiterService } from "./auth-rate-limiter.service.js";
import { AuthSessionService } from "./auth-session.service.js";
import { IdentityNormalizerService } from "./identity-normalizer.service.js";
import { PasswordService } from "./password.service.js";
import { TokenService } from "./token.service.js";

interface SessionIssueResult {
  readonly device: DeviceEntity;
  readonly refreshToken: string;
  readonly session: AuthSessionEntity;
  readonly revokedSessions: readonly AuthSessionEntity[];
  readonly newDevice: boolean;
}

@Injectable()
export class AuthCommandService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(AUTH_NOTIFICATION_PORT) private readonly notifications: AuthNotificationPort,
    private readonly identities: IdentityNormalizerService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly rateLimiter: AuthRateLimiterService,
    private readonly sessions: AuthSessionService,
    private readonly realtime: RealtimeEventPublisherService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuthCommandService.name);
  }

  async createRegistrationChallenge(
    identityInput: Identity,
    metadata: RequestMetadata,
  ): Promise<{
    challengeId: string;
    expiresAt: string;
    retryAfterSeconds: number;
    debugCode?: string;
  }> {
    const identity = this.identities.normalize(identityInput);
    const identityHash = this.tokens.hashIdentifier(identity.type, identity.value);
    await this.rateLimiter.assertChallengeAllowed(identityHash, this.ipHash(metadata.ip));
    if (await this.findCredential(identity)) {
      throw new AppError(
        "IDENTIFIER_ALREADY_REGISTERED",
        "The identifier is already registered",
        409,
      );
    }
    return this.createChallenge("REGISTRATION", identity, true);
  }

  async createPasswordResetChallenge(
    identityInput: Identity,
    metadata: RequestMetadata,
  ): Promise<{
    challengeId: string;
    expiresAt: string;
    retryAfterSeconds: number;
    debugCode?: string;
  }> {
    const identity = this.identities.normalize(identityInput);
    const identityHash = this.tokens.hashIdentifier(identity.type, identity.value);
    await this.rateLimiter.assertChallengeAllowed(identityHash, this.ipHash(metadata.ip));
    return this.createChallenge(
      "PASSWORD_RESET",
      identity,
      Boolean(await this.findCredential(identity)),
    );
  }

  async register(input: RegisterRequest, metadata: RequestMetadata): Promise<TokenResponse> {
    const passwordHash = await this.passwords.hash(input.password);
    const result = await this.dataSource.transaction(async (manager) => {
      const challengeResult = await this.consumeChallenge(
        manager,
        input.challengeId,
        input.code,
        "REGISTRATION",
      );
      if (challengeResult.error) return { error: challengeResult.error } as const;
      const challenge = challengeResult.challenge;
      const existingUsername = await manager.getRepository(UserEntity).findOne({
        where: { usernameNormalized: input.username },
      });
      if (existingUsername) {
        throw new AppError("USERNAME_TAKEN", "Username is already in use", 409);
      }
      const identity: Identity = {
        type: challenge.identityType as Identity["type"],
        value: challenge.identityValue,
      };
      if (await this.findCredential(identity, manager)) {
        throw new AppError(
          "IDENTIFIER_ALREADY_REGISTERED",
          "The identifier is already registered",
          409,
        );
      }
      const now = new Date();
      const user = manager.getRepository(UserEntity).create({
        id: uuidv7(),
        username: input.username,
        usernameNormalized: input.username,
        nickname: input.username,
        status: "ACTIVE",
        userType: "USER",
        extensions: {},
      });
      await manager.getRepository(UserEntity).save(user);
      await manager.getRepository(UserCredentialEntity).save({
        userId: user.id,
        passwordHash,
        emailNormalized: identity.type === "EMAIL" ? identity.value : null,
        phoneE164: identity.type === "PHONE" ? identity.value : null,
        identityVerifiedAt: now,
        passwordChangedAt: now,
      });
      await manager.getRepository(UserPrivacySettingsEntity).save({ userId: user.id });
      challenge.consumedAt = now;
      await manager.getRepository(AuthChallengeEntity).save(challenge);
      const issue = await this.issueSession(manager, user.id, input.device, metadata);
      return { user, issue } as const;
    });
    if ("error" in result) throw result.error;
    await this.notifyRevoked(result.issue.revokedSessions);
    return this.tokenResponse(result.user, result.issue);
  }

  async login(input: LoginRequest, metadata: RequestMetadata): Promise<TokenResponse> {
    const identity = this.identities.normalize(input.identity);
    const identityHash = this.tokens.hashIdentifier(identity.type, identity.value);
    const ipHash = this.ipHash(metadata.ip);
    await this.rateLimiter.assertLoginAllowed(identityHash, ipHash);
    const credential = await this.findCredential(identity);
    if (!credential?.passwordHash || !credential.user) {
      await this.passwords.verifyDummy(input.password);
      await this.recordLoginAttempt(
        identityHash,
        null,
        input.device.clientDeviceId,
        metadata,
        "FAILED",
      );
      await this.rateLimiter.recordLoginFailure(identityHash, ipHash);
      this.logger.warn({ identityHash, ipHash }, "Authentication failed");
      throw this.invalidCredentials();
    }
    const valid = await this.passwords.verify(credential.passwordHash, input.password);
    if (!valid) {
      await this.recordLoginAttempt(
        identityHash,
        credential.userId,
        input.device.clientDeviceId,
        metadata,
        "FAILED",
      );
      await this.rateLimiter.recordLoginFailure(identityHash, ipHash);
      this.logger.warn(
        { identityHash, ipHash, userId: credential.userId },
        "Authentication failed",
      );
      throw this.invalidCredentials();
    }
    this.assertActiveUser(credential.user);
    const issue = await this.dataSource.transaction((manager) =>
      this.issueSession(manager, credential.userId, input.device, metadata),
    );
    await this.rateLimiter.clearLoginFailures(identityHash);
    await this.recordLoginAttempt(
      identityHash,
      credential.userId,
      input.device.clientDeviceId,
      metadata,
      "SUCCEEDED",
      [
        ...(issue.newDevice ? ["NEW_DEVICE"] : []),
        ...(issue.revokedSessions.length === 0 ? [] : ["SESSION_REPLACED"]),
      ],
    );
    if (issue.newDevice) {
      this.logger.warn(
        { userId: credential.userId, deviceId: issue.device.id },
        "New device login",
      );
    }
    await this.notifyRevoked(issue.revokedSessions);
    return this.tokenResponse(credential.user, issue);
  }

  async refresh(refreshTokenInput: string, metadata: RequestMetadata): Promise<TokenResponse> {
    const parsed = this.tokens.parseRefreshToken(refreshTokenInput);
    const result = await this.dataSource.transaction(async (manager) => {
      const token = await manager.getRepository(AuthRefreshTokenEntity).findOne({
        where: { id: parsed.id },
        lock: { mode: "pessimistic_write" },
      });
      if (!token || !this.tokens.refreshHashMatches(token.tokenHash, parsed.hash)) {
        return { error: new AppError("AUTH_TOKEN_INVALID", "Refresh token is invalid", 401) };
      }
      const session = await manager.getRepository(AuthSessionEntity).findOne({
        where: { id: token.sessionId },
        lock: { mode: "pessimistic_write" },
      });
      if (!session) {
        return { error: new AppError("AUTH_TOKEN_INVALID", "Refresh token is invalid", 401) };
      }
      if (token.status === "USED") {
        await this.revokeFamily(manager, token.tokenFamilyId, "REFRESH_TOKEN_REUSED");
        return {
          error: new AppError(
            "AUTH_REFRESH_REUSED",
            "Refresh token reuse revoked the token family",
            401,
          ),
          reusedSession: session,
        };
      }
      if (
        token.status !== "ACTIVE" ||
        token.expiresAt.getTime() <= Date.now() ||
        session.status !== "ACTIVE" ||
        session.expiresAt.getTime() <= Date.now()
      ) {
        return { error: new AppError("AUTH_SESSION_REVOKED", "Session is no longer active", 401) };
      }
      const device = await manager.getRepository(DeviceEntity).findOneBy({ id: session.deviceId });
      const user = await manager.getRepository(UserEntity).findOneBy({ id: session.userId });
      if (!device || !user || device.status !== "ACTIVE" || user.status !== "ACTIVE") {
        await this.sessions.revokeSession(manager, session.id, "SUBJECT_UNAVAILABLE");
        return { error: new AppError("AUTH_SESSION_REVOKED", "Session is no longer active", 401) };
      }
      const next = this.tokens.createRefreshToken();
      token.status = "USED";
      token.usedAt = new Date();
      token.replacedByTokenId = next.id;
      await manager.getRepository(AuthRefreshTokenEntity).save(token);
      await manager.getRepository(AuthRefreshTokenEntity).save({
        id: next.id,
        sessionId: session.id,
        tokenFamilyId: session.tokenFamilyId,
        tokenHash: next.hash,
        status: "ACTIVE",
        expiresAt: session.expiresAt,
      });
      session.lastUsedAt = new Date();
      session.lastIp = metadata.ip;
      session.lastUserAgent = metadata.userAgent;
      await manager.getRepository(AuthSessionEntity).save(session);
      return { user, device, session, refreshToken: next.token };
    });
    if (result.error) {
      if (result.reusedSession) {
        this.logger.warn(
          { sessionId: result.reusedSession.id, userId: result.reusedSession.userId },
          "Refresh token reuse detected",
        );
        await this.notifyRevoked([result.reusedSession]);
      }
      throw result.error;
    }
    return this.tokenResponse(result.user, {
      device: result.device,
      refreshToken: result.refreshToken,
      session: result.session,
      revokedSessions: [],
      newDevice: false,
    });
  }

  async logout(refreshTokenInput: string): Promise<void> {
    let parsed: { id: string; hash: string };
    try {
      parsed = this.tokens.parseRefreshToken(refreshTokenInput);
    } catch {
      return;
    }
    const session = await this.dataSource.transaction(async (manager) => {
      const token = await manager
        .getRepository(AuthRefreshTokenEntity)
        .findOneBy({ id: parsed.id });
      if (!token || !this.tokens.refreshHashMatches(token.tokenHash, parsed.hash)) return null;
      return this.sessions.revokeSession(manager, token.sessionId, "LOGOUT");
    });
    if (session) await this.notifyRevoked([session]);
  }

  async logoutAll(context: AuthContext): Promise<void> {
    const revoked = await this.revokeUserSessions(context.userId, "LOGOUT_ALL");
    await this.notifyRevoked(revoked);
  }

  async changePassword(
    context: AuthContext,
    currentPassword: string,
    newPassword: string,
    revokeOtherSessions: boolean,
  ): Promise<void> {
    const credential = await this.dataSource.getRepository(UserCredentialEntity).findOneBy({
      userId: context.userId,
    });
    if (
      !credential?.passwordHash ||
      !(await this.passwords.verify(credential.passwordHash, currentPassword))
    ) {
      throw this.invalidCredentials();
    }
    const passwordHash = await this.passwords.hash(newPassword);
    const revoked = await this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(UserCredentialEntity)
        .update({ userId: context.userId }, { passwordHash, passwordChangedAt: new Date() });
      if (!revokeOtherSessions) return [];
      return this.revokeUserSessionsInManager(
        manager,
        context.userId,
        "PASSWORD_CHANGED",
        context.sessionId,
      );
    });
    await this.notifyRevoked(revoked);
  }

  async confirmPasswordReset(
    challengeId: string,
    code: string,
    newPassword: string,
  ): Promise<void> {
    const passwordHash = await this.passwords.hash(newPassword);
    const result = await this.dataSource.transaction(async (manager) => {
      const challengeResult = await this.consumeChallenge(
        manager,
        challengeId,
        code,
        "PASSWORD_RESET",
      );
      if (challengeResult.error) return { error: challengeResult.error };
      const challenge = challengeResult.challenge;
      const identity: Identity = {
        type: challenge.identityType as Identity["type"],
        value: challenge.identityValue,
      };
      const credential = await this.findCredential(identity, manager);
      challenge.consumedAt = new Date();
      await manager.getRepository(AuthChallengeEntity).save(challenge);
      if (!credential) return { revoked: [] as AuthSessionEntity[] };
      credential.passwordHash = passwordHash;
      credential.passwordChangedAt = new Date();
      await manager.getRepository(UserCredentialEntity).save(credential);
      const revoked = await this.revokeUserSessionsInManager(
        manager,
        credential.userId,
        "PASSWORD_RESET",
      );
      return { revoked };
    });
    if (result.error) throw result.error;
    await this.notifyRevoked(result.revoked);
  }

  private async createChallenge(
    purpose: "REGISTRATION" | "PASSWORD_RESET",
    identity: Identity,
    deliver: boolean,
  ): Promise<{
    challengeId: string;
    expiresAt: string;
    retryAfterSeconds: number;
    debugCode?: string;
  }> {
    const id = uuidv7();
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const expiresAt = new Date(Date.now() + this.config.auth.challengeTtlSeconds * 1000);
    await this.dataSource.getRepository(AuthChallengeEntity).save({
      id,
      purpose,
      identityType: identity.type,
      identityValue: identity.value,
      codeHash: this.tokens.hashChallenge(id, code),
      expiresAt,
    });
    if (deliver) {
      await this.notifications.sendChallenge({ challengeId: id, code, identity, purpose });
    }
    return {
      challengeId: id,
      expiresAt: expiresAt.toISOString(),
      retryAfterSeconds: this.config.auth.challengeResendSeconds,
      ...(this.config.auth.exposeChallengeCode ? { debugCode: code } : {}),
    };
  }

  private async consumeChallenge(
    manager: EntityManager,
    id: string,
    code: string,
    purpose: "REGISTRATION" | "PASSWORD_RESET",
  ): Promise<
    { challenge: AuthChallengeEntity; error?: never } | { challenge?: never; error: AppError }
  > {
    const repository = manager.getRepository(AuthChallengeEntity);
    const challenge = await repository.findOne({
      where: { id },
      lock: { mode: "pessimistic_write" },
    });
    if (!challenge || challenge.purpose !== purpose || challenge.consumedAt) {
      return { error: new AppError("VERIFICATION_INVALID", "Verification code is invalid", 400) };
    }
    if (challenge.expiresAt.getTime() <= Date.now()) {
      return { error: new AppError("VERIFICATION_EXPIRED", "Verification code has expired", 400) };
    }
    if (challenge.attempts >= this.config.auth.challengeMaxAttempts) {
      return {
        error: new AppError(
          "VERIFICATION_ATTEMPTS_EXCEEDED",
          "Verification attempts exceeded",
          429,
        ),
      };
    }
    const expected = this.tokens.hashChallenge(id, code);
    if (!this.tokens.refreshHashMatches(challenge.codeHash, expected)) {
      challenge.attempts += 1;
      await repository.save(challenge);
      return { error: new AppError("VERIFICATION_INVALID", "Verification code is invalid", 400) };
    }
    return { challenge };
  }

  private async issueSession(
    manager: EntityManager,
    userId: string,
    input: DeviceInput,
    metadata: RequestMetadata,
  ): Promise<SessionIssueResult> {
    await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [userId]);
    const devices = manager.getRepository(DeviceEntity);
    let device = await devices.findOneBy({ userId, clientDeviceId: input.clientDeviceId });
    const newDevice = !device;
    if (!device) {
      const activeCount = await devices.countBy({ userId, status: "ACTIVE" });
      if (activeCount >= this.config.auth.maxDevices) {
        throw new AppError("DEVICE_LIMIT_REACHED", "Device limit reached", 409);
      }
      device = devices.create({
        id: uuidv7(),
        userId,
        clientDeviceId: input.clientDeviceId,
        platform: input.platform,
        name: input.name,
        appVersion: input.appVersion ?? null,
        status: "ACTIVE",
        lastIp: metadata.ip,
        lastUserAgent: metadata.userAgent,
        lastSeenAt: new Date(),
      });
    } else {
      device.platform = input.platform;
      device.name = input.name;
      device.appVersion = input.appVersion ?? null;
      device.status = "ACTIVE";
      device.revokedAt = null;
      device.lastIp = metadata.ip;
      device.lastUserAgent = metadata.userAgent;
      device.lastSeenAt = new Date();
    }
    await devices.save(device);

    const existingSessions = await manager.getRepository(AuthSessionEntity).findBy({
      userId,
      deviceId: device.id,
      status: "ACTIVE",
    });
    const revokedSessions: AuthSessionEntity[] = [];
    for (const existing of existingSessions) {
      const revoked = await this.sessions.revokeSession(manager, existing.id, "SESSION_REPLACED");
      if (revoked) revokedSessions.push(revoked);
    }
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const session = manager.getRepository(AuthSessionEntity).create({
      id: uuidv7(),
      userId,
      deviceId: device.id,
      tokenFamilyId: uuidv7(),
      status: "ACTIVE",
      lastIp: metadata.ip,
      lastUserAgent: metadata.userAgent,
      lastUsedAt: now,
      expiresAt,
    });
    await manager.getRepository(AuthSessionEntity).save(session);
    const refresh = this.tokens.createRefreshToken();
    await manager.getRepository(AuthRefreshTokenEntity).save({
      id: refresh.id,
      sessionId: session.id,
      tokenFamilyId: session.tokenFamilyId,
      tokenHash: refresh.hash,
      status: "ACTIVE",
      expiresAt,
    });
    return { device, session, refreshToken: refresh.token, revokedSessions, newDevice };
  }

  private async tokenResponse(user: UserEntity, issue: SessionIssueResult): Promise<TokenResponse> {
    return {
      tokenType: "Bearer",
      accessToken: await this.tokens.signAccessToken({
        userId: user.id,
        sessionId: issue.session.id,
        deviceId: issue.device.id,
      }),
      expiresIn: 900,
      refreshToken: issue.refreshToken,
      refreshExpiresIn: 2_592_000,
      user: toCurrentUser(user),
      device: toDevice(issue.device),
      session: toSession(issue.session),
    };
  }

  private async findCredential(
    identity: Identity,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<UserCredentialEntity | null> {
    const credential = await manager.getRepository(UserCredentialEntity).findOne({
      where:
        identity.type === "EMAIL"
          ? { emailNormalized: identity.value }
          : { phoneE164: identity.value },
    });
    if (credential) {
      const user = await manager.getRepository(UserEntity).findOneBy({ id: credential.userId });
      if (user) credential.user = user;
    }
    return credential;
  }

  private assertActiveUser(user: UserEntity): void {
    if (user.status !== "ACTIVE") {
      throw new AppError("AUTH_ACCOUNT_UNAVAILABLE", "Account is unavailable", 403);
    }
  }

  private invalidCredentials(): AppError {
    return new AppError("AUTH_INVALID_CREDENTIALS", "Invalid credentials", 401);
  }

  private ipHash(ip: string | null): string {
    return this.tokens.hashIdentifier("IP", ip ?? "unknown");
  }

  private async recordLoginAttempt(
    identityHash: string,
    userId: string | null,
    clientDeviceId: string,
    metadata: RequestMetadata,
    result: string,
    riskReasons: string[] = [],
  ): Promise<void> {
    await this.dataSource.getRepository(AuthLoginAttemptEntity).save({
      identityHash,
      userId,
      clientDeviceId,
      ip: metadata.ip,
      result,
      riskReasons,
    });
  }

  private async revokeFamily(
    manager: EntityManager,
    familyId: string,
    reason: string,
  ): Promise<void> {
    await manager
      .getRepository(AuthRefreshTokenEntity)
      .update({ tokenFamilyId: familyId }, { status: "REVOKED" });
    const sessions = await manager
      .getRepository(AuthSessionEntity)
      .findBy({ tokenFamilyId: familyId });
    for (const session of sessions) await this.sessions.revokeSession(manager, session.id, reason);
  }

  private revokeUserSessions(userId: string, reason: string): Promise<AuthSessionEntity[]> {
    return this.dataSource.transaction((manager) =>
      this.revokeUserSessionsInManager(manager, userId, reason),
    );
  }

  private async revokeUserSessionsInManager(
    manager: EntityManager,
    userId: string,
    reason: string,
    exceptSessionId?: string,
  ): Promise<AuthSessionEntity[]> {
    const active = await manager
      .getRepository(AuthSessionEntity)
      .findBy({ userId, status: "ACTIVE" });
    const revoked: AuthSessionEntity[] = [];
    for (const session of active) {
      if (session.id === exceptSessionId) continue;
      const value = await this.sessions.revokeSession(manager, session.id, reason);
      if (value) revoked.push(value);
    }
    return revoked;
  }

  private async notifyRevoked(sessions: readonly AuthSessionEntity[]): Promise<void> {
    await Promise.all(
      sessions.map(async (session) => {
        await this.sessions.rememberRevocation(session.id, session.expiresAt);
        await this.realtime
          .revokeSession({
            sessionId: session.id,
            deviceId: session.deviceId,
            reason: session.revokedReason ?? "REVOKED",
          })
          .catch((error: unknown) => {
            this.logger.warn({ err: error, sessionId: session.id }, "Realtime revocation failed");
          });
      }),
    );
  }
}
