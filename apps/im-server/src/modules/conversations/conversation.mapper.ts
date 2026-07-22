import type { Conversation } from "@im/contracts/api";

import type { UserEntity } from "../users/persistence/entities/user.entity.js";
import { toPublicUser } from "../users/user.mapper.js";
import { toMessage } from "../messages/message.mapper.js";
import type { MessageEntity } from "../messages/persistence/entities/message.entity.js";
import type { ConversationUserStateEntity } from "./persistence/entities/conversation-user-state.entity.js";
import type { ConversationEntity } from "./persistence/entities/conversation.entity.js";

export function toConversation(
  conversation: ConversationEntity,
  state: ConversationUserStateEntity,
  peer: UserEntity | null,
  lastMessage: MessageEntity | null,
): Conversation {
  return {
    id: conversation.id,
    type: conversation.type as "DIRECT" | "GROUP" | "SYSTEM",
    peer: peer ? toPublicUser(peer) : null,
    lastSeq: conversation.lastSeq,
    lastMessage: lastMessage ? toMessage(lastMessage) : null,
    unreadCount: state.unreadCount,
    lastDeliveredSeq: state.lastDeliveredSeq,
    lastReadSeq: state.lastReadSeq,
    pinned: state.pinnedRank !== null,
    muted: state.muted,
    archived: state.archivedAt !== null,
    hidden: state.hiddenAt !== null,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  };
}
