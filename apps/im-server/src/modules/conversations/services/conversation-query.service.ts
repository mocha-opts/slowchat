import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { Conversation } from "@im/contracts/api";
import { DataSource } from "typeorm";

import { AppError } from "../../../common/errors/app-error.js";
import { MessageEntity } from "../../messages/persistence/entities/message.entity.js";
import { UserEntity } from "../../users/persistence/entities/user.entity.js";
import { toConversation } from "../conversation.mapper.js";
import { ConversationMemberEntity } from "../persistence/entities/conversation-member.entity.js";
import { ConversationUserStateEntity } from "../persistence/entities/conversation-user-state.entity.js";
import { ConversationEntity } from "../persistence/entities/conversation.entity.js";

interface ConversationCursor {
  pinnedRank: number | null;
  sortAt: string;
  id: string;
}

@Injectable()
export class ConversationQueryService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async get(userId: string, conversationId: string, includeHidden = true): Promise<Conversation> {
    const row = await this.dataSource
      .getRepository(ConversationUserStateEntity)
      .createQueryBuilder("state")
      .innerJoinAndMapOne(
        "state.conversation",
        ConversationEntity,
        "conversation",
        "conversation.id = state.conversation_id AND conversation.status = 'ACTIVE'",
      )
      .innerJoin(
        ConversationMemberEntity,
        "member",
        "member.conversation_id = state.conversation_id AND member.user_id = state.user_id AND member.status = 'ACTIVE'",
      )
      .where("state.user_id = :userId", { userId })
      .andWhere("state.conversation_id = :conversationId", { conversationId })
      .getOne();
    if (!row || (!includeHidden && row.hiddenAt)) {
      throw new AppError("CONVERSATION_NOT_FOUND", "Conversation was not found", 404);
    }
    const conversation = (row as ConversationUserStateEntity & { conversation: ConversationEntity })
      .conversation;
    return this.hydrate(userId, conversation, row);
  }

  async list(
    userId: string,
    cursorInput: string | undefined,
    limit: number,
  ): Promise<{ items: Conversation[]; nextCursor: string | null; hasMore: boolean }> {
    const cursor = decodeConversationCursor(cursorInput);
    const builder = this.dataSource
      .getRepository(ConversationUserStateEntity)
      .createQueryBuilder("state")
      .innerJoinAndMapOne(
        "state.conversation",
        ConversationEntity,
        "conversation",
        "conversation.id = state.conversation_id AND conversation.status = 'ACTIVE'",
      )
      .innerJoin(
        ConversationMemberEntity,
        "member",
        "member.conversation_id = state.conversation_id AND member.user_id = state.user_id AND member.status = 'ACTIVE'",
      )
      .where("state.user_id = :userId", { userId })
      .andWhere("state.hidden_at IS NULL")
      .addSelect(
        "COALESCE(conversation.last_message_at, conversation.created_at)",
        "conversation_sort_at",
      );
    if (cursor) {
      builder.andWhere(
        `(COALESCE(state.pinned_rank, -1), COALESCE(conversation.last_message_at, conversation.created_at), conversation.id)
          < (:pinnedRank, :sortAt, :id)`,
        {
          pinnedRank: cursor.pinnedRank ?? -1,
          sortAt: cursor.sortAt,
          id: cursor.id,
        },
      );
    }
    const rows = await builder
      .orderBy("state.pinned_rank", "DESC", "NULLS LAST")
      .addOrderBy("conversation_sort_at", "DESC")
      .addOrderBy("conversation.id", "DESC")
      .take(limit + 1)
      .getMany();
    const selected = rows.slice(0, limit);
    const items = await Promise.all(
      selected.map((state) => {
        const conversation = (
          state as ConversationUserStateEntity & { conversation: ConversationEntity }
        ).conversation;
        return this.hydrate(userId, conversation, state);
      }),
    );
    const hasMore = rows.length > limit;
    const lastState = selected.at(-1);
    if (!hasMore || !lastState) return { items, nextCursor: null, hasMore };
    const lastConversation = (
      lastState as ConversationUserStateEntity & { conversation: ConversationEntity }
    ).conversation;
    return {
      items,
      hasMore,
      nextCursor: encodeConversationCursor({
        pinnedRank: lastState.pinnedRank,
        sortAt: (lastConversation.lastMessageAt ?? lastConversation.createdAt).toISOString(),
        id: lastConversation.id,
      }),
    };
  }

  private async hydrate(
    userId: string,
    conversation: ConversationEntity,
    state: ConversationUserStateEntity,
  ): Promise<Conversation> {
    const members = await this.dataSource.getRepository(ConversationMemberEntity).findBy({
      conversationId: conversation.id,
      status: "ACTIVE",
    });
    const peerId = members.find((member) => member.userId !== userId)?.userId;
    const [peer, lastMessage] = await Promise.all([
      peerId ? this.dataSource.getRepository(UserEntity).findOneBy({ id: peerId }) : null,
      conversation.lastMessageId
        ? this.dataSource.getRepository(MessageEntity).findOneBy({ id: conversation.lastMessageId })
        : null,
    ]);
    return toConversation(conversation, state, peer, lastMessage);
  }
}

function encodeConversationCursor(cursor: ConversationCursor): string {
  return Buffer.from(JSON.stringify({ v: 1, ...cursor }), "utf8").toString("base64url");
}

function decodeConversationCursor(value: string | undefined): ConversationCursor | null {
  if (!value) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    if (
      decoded.v !== 1 ||
      (decoded.pinnedRank !== null && !Number.isSafeInteger(decoded.pinnedRank)) ||
      typeof decoded.sortAt !== "string" ||
      Number.isNaN(Date.parse(decoded.sortAt)) ||
      typeof decoded.id !== "string"
    ) {
      throw new Error("invalid cursor");
    }
    return {
      pinnedRank: decoded.pinnedRank as number | null,
      sortAt: decoded.sortAt,
      id: decoded.id,
    };
  } catch {
    throw new AppError("VALIDATION_ERROR", "Cursor is invalid", 400);
  }
}
