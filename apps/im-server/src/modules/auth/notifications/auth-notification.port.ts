import type { Identity } from "@im/contracts/api";

export const AUTH_NOTIFICATION_PORT = Symbol("AUTH_NOTIFICATION_PORT");

export interface AuthNotificationPort {
  sendChallenge(input: {
    challengeId: string;
    code: string;
    identity: Identity;
    purpose: "REGISTRATION" | "PASSWORD_RESET";
  }): Promise<void>;
}
