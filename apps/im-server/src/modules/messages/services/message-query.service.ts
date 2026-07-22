import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { Message } from "@im/contracts/messages";
import { DataSource } from "typeorm";

import { AppError } from "../../../common/errors/app-error.js";
import { ConversationMemberEntity } from "../../conversations/persistence/entities/conversation-member.entity.js";
import { ConversationUserStateEntity } from "../../conversations/persistence/entities/conversation-user-state.entity.js";
import { toMessage } from "../message.mapper.js";
import { MessageEntity } from "../persistence/entities/message.entity.js";

@Injectable()
export class MessageQueryService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async get(userId: string, messageId: string): Promise<Message> {
    const message = await this.dataSource.getRepository(MessageEntity).findOneBy({ id: messageId });
    if (!message || !(await this.isMember(userId, message.conversationId))) {
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

  private isMember(userId: string, conversationId: string): Promise<boolean> {
    return this.dataSource.getRepository(ConversationMemberEntity).existsBy({
      conversationId,
      userId,
      status: "ACTIVE",
    });
  }
}
