import { hash, verify } from "@node-rs/argon2";
import { Injectable, type OnModuleInit } from "@nestjs/common";

import { AppError } from "../../../common/errors/app-error.js";

@Injectable()
export class PasswordService implements OnModuleInit {
  private dummyHash: string | undefined;

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hash("dummy-password-that-is-never-valid");
  }

  async hash(password: string): Promise<string> {
    this.assertPolicy(password);
    return hash(password, {
      algorithm: 2,
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 1,
      outputLen: 32,
    });
  }

  verify(hashValue: string, password: string): Promise<boolean> {
    return verify(hashValue, password);
  }

  async verifyDummy(password: string): Promise<void> {
    this.dummyHash ??= await this.hash("dummy-password-that-is-never-valid");
    await verify(this.dummyHash, password).catch(() => false);
  }

  assertPolicy(password: string): void {
    if (password.length < 12 || password.length > 128) {
      throw new AppError(
        "PASSWORD_POLICY_VIOLATION",
        "Password does not satisfy the password policy",
        400,
      );
    }
  }
}
