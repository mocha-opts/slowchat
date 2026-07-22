import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { GroupMember, GroupProfile } from "@im/contracts/api";
import { DataSource, In } from "typeorm";

import { AppError } from "../../../common/errors/app-error.js";
import { ConversationMemberEntity } from "../../conversations/persistence/entities/conversation-member.entity.js";
import { ConversationEntity } from "../../conversations/persistence/entities/conversation.entity.js";
import { UserEntity } from "../../users/persistence/entities/user.entity.js";
import { GroupProfileEntity } from "../persistence/entities/group-profile.entity.js";
import { toGroupMember, toGroupProfile } from "../group.mapper.js";

interface MemberCursor {
  joinedAt: string;
  userId: string;
}

@Injectable()
export class GroupQueryService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async profile(userId: string, conversationId: string): Promise<GroupProfile> {
    await this.assertMember(userId, conversationId);
    const value = await this.dataSource
      .getRepository(GroupProfileEntity)
      .findOneBy({ conversationId });
    if (!value) throw new AppError("CONVERSATION_NOT_FOUND", "Group was not found", 404);
    return toGroupProfile(value);
  }

  async members(
    userId: string,
    conversationId: string,
    cursorInput: string | undefined,
    limit: number,
  ) {
    await this.assertMember(userId, conversationId);
    const cursor = decodeMemberCursor(cursorInput);
    const builder = this.dataSource
      .getRepository(ConversationMemberEntity)
      .createQueryBuilder("member")
      .where("member.conversation_id = :conversationId AND member.status = 'ACTIVE'", {
        conversationId,
      });
    if (cursor)
      builder.andWhere("(member.joined_at, member.user_id) < (:joinedAt, :userId)", cursor);
    const rows = await builder
      .orderBy("member.joined_at", "DESC")
      .addOrderBy("member.user_id", "DESC")
      .take(limit + 1)
      .getMany();
    const selected = rows.slice(0, limit);
    const users = await this.dataSource
      .getRepository(UserEntity)
      .findBy({ id: In(selected.map((row) => row.userId)) });
    const map = new Map(users.map((value) => [value.id, value]));
    const items: GroupMember[] = selected.map((row) => {
      const user = map.get(row.userId);
      if (!user) throw new AppError("INTERNAL_ERROR", "Group member user is missing", 500);
      return toGroupMember(row, user);
    });
    const hasMore = rows.length > limit;
    const last = selected.at(-1);
    return {
      items,
      hasMore,
      nextCursor:
        hasMore && last
          ? encodeMemberCursor({ joinedAt: last.joinedAt.toISOString(), userId: last.userId })
          : null,
    };
  }

  private async assertMember(userId: string, conversationId: string): Promise<void> {
    const member = await this.dataSource
      .getRepository(ConversationMemberEntity)
      .existsBy({ conversationId, userId, status: "ACTIVE" });
    const group = await this.dataSource
      .getRepository(ConversationEntity)
      .existsBy({ id: conversationId, type: "GROUP", status: "ACTIVE" });
    if (!member || !group) throw new AppError("CONVERSATION_NOT_FOUND", "Group was not found", 404);
  }
}

function encodeMemberCursor(value: MemberCursor): string {
  return Buffer.from(JSON.stringify({ v: 1, ...value }), "utf8").toString("base64url");
}

function decodeMemberCursor(value: string | undefined): MemberCursor | null {
  if (!value) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    if (
      decoded.v !== 1 ||
      typeof decoded.joinedAt !== "string" ||
      Number.isNaN(Date.parse(decoded.joinedAt)) ||
      typeof decoded.userId !== "string"
    )
      throw new Error("invalid cursor");
    return { joinedAt: decoded.joinedAt, userId: decoded.userId };
  } catch {
    throw new AppError("VALIDATION_ERROR", "Cursor is invalid", 400);
  }
}
