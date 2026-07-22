import type { GroupInvite, GroupJoinRequest, GroupMember, GroupProfile } from "@im/contracts/api";

import type { UserEntity } from "../users/persistence/entities/user.entity.js";
import { toPublicUser } from "../users/user.mapper.js";
import type { ConversationMemberEntity } from "../conversations/persistence/entities/conversation-member.entity.js";
import type { GroupInviteEntity } from "./persistence/entities/group-invite.entity.js";
import type { GroupJoinRequestEntity } from "./persistence/entities/group-join-request.entity.js";
import type { GroupProfileEntity } from "./persistence/entities/group-profile.entity.js";

export function toGroupProfile(value: GroupProfileEntity): GroupProfile {
  return {
    conversationId: value.conversationId,
    title: value.title,
    announcement: value.announcement,
    maxMembers: value.maxMembers,
    joinMode: value.joinMode as GroupProfile["joinMode"],
    allowMemberInvites: value.allowMemberInvites,
    allMembersMuted: value.allMembersMuted,
    version: value.version,
  };
}

export function toGroupMember(value: ConversationMemberEntity, user: UserEntity): GroupMember {
  return {
    user: toPublicUser(user),
    role: value.role as GroupMember["role"],
    status: value.status as GroupMember["status"],
    nickname: value.nickname,
    joinedSeq: value.joinedSeq,
    joinedAt: value.joinedAt.toISOString(),
    muteUntil: value.muteUntil?.toISOString() ?? null,
  };
}

export function toGroupJoinRequest(
  value: GroupJoinRequestEntity,
  user: UserEntity,
): GroupJoinRequest {
  return {
    id: value.id,
    conversationId: value.conversationId,
    user: toPublicUser(user),
    status: value.status as GroupJoinRequest["status"],
    message: value.message,
    reviewerId: value.reviewerId,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}

export function toGroupInvite(value: GroupInviteEntity): GroupInvite {
  return {
    id: value.id,
    conversationId: value.conversationId,
    inviterId: value.inviterId,
    inviteeId: value.inviteeId,
    status: value.status as GroupInvite["status"],
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}
