import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { errors as joseErrors, importPKCS8, importSPKI, jwtVerify, SignJWT } from "jose";
import { v7 as uuidv7 } from "uuid";

import { APP_CONFIG, type AppConfig } from "../../../platform/config/app-config.js";
import { AppError } from "../../../common/errors/app-error.js";
import type { AuthContext } from "../auth.types.js";

@Injectable()
export class TokenService implements OnModuleInit {
  private privateKey: Awaited<ReturnType<typeof importPKCS8>> | undefined;
  private publicKey: Awaited<ReturnType<typeof importSPKI>> | undefined;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async onModuleInit(): Promise<void> {
    if (this.config.auth.jwtPublicKeyPath) {
      this.publicKey = await importSPKI(
        await readFile(this.config.auth.jwtPublicKeyPath, "utf8"),
        "RS256",
      );
    }
    if (this.config.auth.jwtPrivateKeyPath) {
      this.privateKey = await importPKCS8(
        await readFile(this.config.auth.jwtPrivateKeyPath, "utf8"),
        "RS256",
      );
    }
  }

  async signAccessToken(context: AuthContext): Promise<string> {
    if (!this.privateKey) throw new Error("JWT private key is not configured for this process");
    return new SignJWT({ sessionId: context.sessionId, deviceId: context.deviceId })
      .setProtectedHeader({ alg: "RS256", kid: this.config.auth.jwtKeyId, typ: "JWT" })
      .setSubject(context.userId)
      .setIssuer(this.config.auth.jwtIssuer)
      .setAudience(this.config.auth.jwtAudience)
      .setJti(uuidv7())
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(this.privateKey);
  }

  async verifyAccessToken(token: string): Promise<AuthContext> {
    if (!this.publicKey) throw new Error("JWT public key is not configured for this process");
    try {
      const { payload, protectedHeader } = await jwtVerify(token, this.publicKey, {
        algorithms: ["RS256"],
        issuer: this.config.auth.jwtIssuer,
        audience: this.config.auth.jwtAudience,
      });
      if (
        !payload.sub ||
        !payload.jti ||
        protectedHeader.kid !== this.config.auth.jwtKeyId ||
        typeof payload.sessionId !== "string" ||
        typeof payload.deviceId !== "string"
      ) {
        throw new Error("Missing access token claims");
      }
      return {
        userId: payload.sub,
        sessionId: payload.sessionId,
        deviceId: payload.deviceId,
      };
    } catch (error) {
      if (error instanceof joseErrors.JWTExpired) {
        throw new AppError("AUTH_TOKEN_EXPIRED", "Access token has expired", 401);
      }
      throw new AppError("AUTH_TOKEN_INVALID", "Access token is invalid or expired", 401);
    }
  }

  createRefreshToken(): { id: string; secret: string; token: string; hash: string } {
    const id = uuidv7();
    const secret = randomBytes(32).toString("base64url");
    const token = `${id}.${secret}`;
    return { id, secret, token, hash: this.hashRefreshToken(token) };
  }

  parseRefreshToken(token: string): { id: string; hash: string } {
    const [id, secret, extra] = token.split(".");
    if (!id || !secret || extra) {
      throw new AppError("AUTH_TOKEN_INVALID", "Refresh token is invalid", 401);
    }
    return { id, hash: this.hashRefreshToken(token) };
  }

  refreshHashMatches(expected: string, actual: string): boolean {
    const left = Buffer.from(expected, "hex");
    const right = Buffer.from(actual, "hex");
    return left.length === right.length && timingSafeEqual(left, right);
  }

  hashChallenge(challengeId: string, code: string): string {
    return this.hmac(this.config.auth.challengePepper, `${challengeId}:${code}`);
  }

  hashIdentifier(type: string, value: string): string {
    return this.hmac(this.config.auth.identifierPepper, `${type}:${value}`);
  }

  private hashRefreshToken(token: string): string {
    return this.hmac(this.config.auth.refreshTokenPepper, token);
  }

  private hmac(key: string, value: string): string {
    return createHmac("sha256", key).update(value).digest("hex");
  }
}
