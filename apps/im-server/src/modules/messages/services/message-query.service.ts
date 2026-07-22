import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { Message } from "@im/contracts/messages";
import type { MessageSearchResponse } from "@im/contracts/api";
import { DataSource } from "typeorm";

import { AppError } from "../../../common/errors/app-error.js";
import { ConversationMemberEntity } from "../../conversations/persistence/entities/conversation-member.entity.js";
import { ConversationUserStateEntity } from "../../conversations/persistence/entities/conversation-user-state.entity.js";
import { toMessage } from "../message.mapper.js";
import { MessageEntity } from "../persistence/entities/message.entity.js";
import { MessageUserHideEntity } from "../persistence/entities/message-user-hide.entity.js";

@Injectable()
export class MessageQueryService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async get(userId: string, messageId: string): Promise<Message> {
    const message = await this.dataSource.getRepository(MessageEntity).findOneBy({ id: messageId });
    const state = message
      ? await this.dataSource.getRepository(ConversationUserStateEntity).findOneBy({
          conversationId: message.conversationId,
          userId,
        })
      : null;
    if (
      !message ||
      !(await this.isMember(userId, message.conversationId)) ||
      (state && message.seq <= state.clearBeforeSeq) ||
      (await this.dataSource.getRepository(MessageUserHideEntity).existsBy({ userId, messageId }))
    ) {
      throw new AppError("MESSAGE_NOT_FOUND", "Message was not found", 404);
    }
    return toMessage(message);
  }

  async history(
    userId: string,
    conversationId: string,
    beforeSeq: number | undefined,
    limit: number,
  ): Promise<{ items: Message[]; nextBeforeSeq: number | null; hasMore: boolean }> {
    if (!(await this.isMember(userId, conversationId))) {
      throw new AppError("CONVERSATION_NOT_FOUND", "Conversation was not found", 404);
    }
    const state = await this.dataSource.getRepository(ConversationUserStateEntity).findOneBy({
      conversationId,
      userId,
    });
    if (!state) throw new AppError("CONVERSATION_NOT_FOUND", "Conversation was not found", 404);
    const builder = this.dataSource
      .getRepository(MessageEntity)
      .createQueryBuilder("message")
      .where("message.conversation_id = :conversationId", { conversationId })
      .leftJoin(
        MessageUserHideEntity,
        "hidden",
        "hidden.message_id = message.id AND hidden.user_id = :userId",
        { userId },
      )
      .andWhere("hidden.message_id IS NULL")
      .andWhere("message.seq > :clearBeforeSeq", { clearBeforeSeq: state.clearBeforeSeq });
    if (beforeSeq !== undefined) builder.andWhere("message.seq < :beforeSeq", { beforeSeq });
    const rows = await builder
      .orderBy("message.seq", "DESC")
      .take(limit + 1)
      .getMany();
    const hasMore = rows.length > limit;
    const selected = rows.slice(0, limit);
    const oldest = selected.at(-1);
    return {
      items: selected.reverse().map(toMessage),
      hasMore,
      nextBeforeSeq: hasMore && oldest ? oldest.seq : null,
    };
  }

  async search(
    userId: string,
    query: string,
    cursorInput: string | undefined,
    limit: number,
  ): Promise<MessageSearchResponse> {
    // Cursor 绑定查询串，防止客户端把另一组结果的游标误用于本次搜索。
    const cursor = decodeSearchCursor(cursorInput, query);
    const builder = this.dataSource
      .getRepository(MessageEntity)
      .createQueryBuilder("message")
      .innerJoin(
        ConversationMemberEntity,
        "member",
        "member.conversation_id = message.conversation_id AND member.user_id = :userId AND member.status = 'ACTIVE'",
        { userId },
      )
      .innerJoin(
        ConversationUserStateEntity,
        "state",
        "state.conversation_id = message.conversation_id AND state.user_id = :userId AND message.seq > state.clear_before_seq",
        { userId },
      )
      .leftJoin(
        MessageUserHideEntity,
        "hidden",
        "hidden.message_id = message.id AND hidden.user_id = :userId",
        { userId },
      )
      .where("message.type = 'TEXT'")
      .andWhere("hidden.message_id IS NULL")
      .andWhere("message.payload ->> 'text' ILIKE :pattern", { pattern: `%${query}%` });
    if (cursor) {
      builder.andWhere("(message.created_at, message.id) < (:createdAt, :id)", {
        createdAt: cursor.createdAt,
        id: cursor.id,
      });
    }
    const rows = await builder
      .orderBy("message.created_at", "DESC")
      .addOrderBy("message.id", "DESC")
      .take(limit + 1)
      .getMany();
    const selected = rows.slice(0, limit);
    const last = selected.at(-1);
    return {
      items: selected.map(toMessage),
      hasMore: rows.length > limit,
      nextCursor:
        rows.length > limit && last
          ? encodeSearchCursor({ query, createdAt: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }

  private isMember(userId: string, conversationId: string): Promise<boolean> {
    return this.dataSource.getRepository(ConversationMemberEntity).existsBy({
      conversationId,
      userId,
      status: "ACTIVE",
    });
  }
}

interface SearchCursor {
  v: 1;
  query: string;
  createdAt: string;
  id: string;
}

function encodeSearchCursor(cursor: Omit<SearchCursor, "v">): string {
  return Buffer.from(JSON.stringify({ v: 1, ...cursor }), "utf8").toString("base64url");
}

function decodeSearchCursor(value: string | undefined, query: string): SearchCursor | null {
  if (!value) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    if (
      decoded.v !== 1 ||
      decoded.query !== query ||
      typeof decoded.createdAt !== "string" ||
      Number.isNaN(Date.parse(decoded.createdAt)) ||
      typeof decoded.id !== "string"
    )
      throw new Error("invalid search cursor");
    return decoded as unknown as SearchCursor;
  } catch {
    throw new AppError("SEARCH_QUERY_INVALID", "Search cursor is invalid", 400);
  }
}
