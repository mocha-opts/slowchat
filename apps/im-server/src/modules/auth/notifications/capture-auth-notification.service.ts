import { Inject, Injectable } from "@nestjs/common";

import { AppError } from "../../../common/errors/app-error.js";
import { APP_CONFIG, type AppConfig } from "../../../platform/config/app-config.js";
import type { AuthNotificationPort } from "./auth-notification.port.js";

@Injectable()
export class CaptureAuthNotificationService implements AuthNotificationPort {
  private readonly challenges = new Map<string, string>();

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async sendChallenge(input: Parameters<AuthNotificationPort["sendChallenge"]>[0]): Promise<void> {
    if (this.config.nodeEnv === "production") {
      throw new AppError(
        "SERVICE_UNAVAILABLE",
        "Authentication notification provider is unavailable",
        503,
      );
    }
    this.challenges.set(input.challengeId, input.code);
    await Promise.resolve();
  }

  takeChallengeCode(challengeId: string): string | undefined {
    const code = this.challenges.get(challengeId);
    this.challenges.delete(challengeId);
    return code;
  }
}
