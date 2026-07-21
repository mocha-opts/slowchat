import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthChallengeEntity } from "./auth/persistence/entities/auth-challenge.entity.js";
import { AuthLoginAttemptEntity } from "./auth/persistence/entities/auth-login-attempt.entity.js";
import { AuthRefreshTokenEntity } from "./auth/persistence/entities/auth-refresh-token.entity.js";
import { AuthSessionEntity } from "./auth/persistence/entities/auth-session.entity.js";
import { BlockEntity } from "./contacts/persistence/entities/block.entity.js";
import { FriendRequestEntity } from "./contacts/persistence/entities/friend-request.entity.js";
import { FriendshipEntity } from "./contacts/persistence/entities/friendship.entity.js";
import { ReportEntity } from "./contacts/persistence/entities/report.entity.js";
import { DeviceEntity } from "./devices/persistence/entities/device.entity.js";
import { UserCredentialEntity } from "./users/persistence/entities/user-credential.entity.js";
import { UserPrivacySettingsEntity } from "./users/persistence/entities/user-privacy-settings.entity.js";
import { UserEntity } from "./users/persistence/entities/user.entity.js";

export const IDENTITY_ENTITIES = [
  UserEntity,
  UserCredentialEntity,
  UserPrivacySettingsEntity,
  DeviceEntity,
  AuthSessionEntity,
  AuthRefreshTokenEntity,
  AuthChallengeEntity,
  AuthLoginAttemptEntity,
  FriendRequestEntity,
  FriendshipEntity,
  BlockEntity,
  ReportEntity,
];

@Module({
  imports: [TypeOrmModule.forFeature(IDENTITY_ENTITIES)],
  exports: [TypeOrmModule],
})
export class IdentityPersistenceModule {}
