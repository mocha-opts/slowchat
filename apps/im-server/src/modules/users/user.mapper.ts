import type { CurrentUser, PublicUser } from "@im/contracts/api";

import type { UserEntity } from "./persistence/entities/user.entity.js";

export function toCurrentUser(user: UserEntity): CurrentUser {
  return {
    id: user.id,
    username: user.username ?? `deleted_${user.id}`,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    signature: user.signature,
    region: user.region,
    status: user.status as CurrentUser["status"],
    type: user.userType as CurrentUser["type"],
    extensions: user.extensions,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function toPublicUser(user: UserEntity): PublicUser {
  const current = toCurrentUser(user);
  return {
    id: current.id,
    username: current.username,
    nickname: current.nickname,
    avatarUrl: current.avatarUrl,
    signature: current.signature,
    region: current.region,
    type: current.type,
  };
}
