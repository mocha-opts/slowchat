import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type {
  MessageRange,
  SyncEventsQuery,
  SyncRequest,
  SyncResponse,
  SyncSnapshot,
} from "@im/contracts/api";
import { DataSource } from "typeorm";

import { AppError } from "../../../common/errors/app-error.js";
import { ContactService } from "../../contacts/services/contact.service.js";
import { DeviceEntity } from "../../devices/persistence/entities/device.entity.js";
import { DeviceService } from "../../devices/services/device.service.js";
import { ConversationQueryService } from "../../conversations/services/conversation-query.service.js";
import { ConversationMemberEntity } from "../../conversations/persistence/entities/conversation-member.entity.js";
import { ConversationUserStateEntity } from "../../conversations/persistence/entities/conversation-user-state.entity.js";
import { MessageEntity } from "../../messages/persistence/entities/message.entity.js";
import { MessageUserHideEntity } from "../../messages/persistence/entities/message-user-hide.entity.js";
import { toMessage } from "../../messages/message.mapper.js";
import { UserService } from "../../users/services/user.service.js";
import { UserSyncEventEntity } from "../persistence/entities/user-sync-event.entity.js";
import { DeviceSyncStateEntity } from "../persistence/entities/device-sync-state.entity.js";
import { toSyncEvent } from "../sync.mapper.js";

/**
 * Sync Query 只读 PostgreSQL 投影和消息事实；它不会依赖 Redis 或 WebSocket，
 * 因此 Realtime 故障时仍能完成断线恢复。
 */
@Injectable()
export class SyncQueryService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly users: UserService,
    private readonly devices: DeviceService,
    private readonly contacts: ContactService,
    private readonly conversations: ConversationQueryService,
  ) {}

  async sync(userId: string, input: SyncRequest): Promise<SyncResponse> {
    await this.assertDevice(userId, input.deviceId);
    const result = await this.listEvents(userId, input.userSyncCursor, input.limit);
    const missingRanges = await this.findMissingRanges(userId, input.lastSeq, result.events);
    await this.saveDeviceCursor(userId, input.deviceId, result.userSyncCursor);
    return { ...result, missingRanges, serverTimestamp: Date.now() };
  }

  async events(userId: string, input: SyncEventsQuery): Promise<SyncResponse> {
    await this.assertDevice(userId, input.deviceId);
    const result = await this.listEvents(userId, input.after, input.limit);
    await this.saveDeviceCursor(userId, input.deviceId, result.userSyncCursor);
    return { ...result, missingRanges: [], serverTimestamp: Date.now() };
  }

  async snapshot(userId: string, deviceId: string): Promise<SyncSnapshot> {
    await this.assertDevice(userId, deviceId);
    const [user, devices, contacts, blocks, conversations] = await Promise.all([
      this.users.getCurrent(userId),
      this.devices.listDevices(userId),
      this.contacts.listContacts(userId, undefined, 100),
      this.contacts.listBlocks(userId, undefined, 100),
      this.conversations.list(userId, undefined, 100),
    ]);
    const cursor = await this.latestCursor(userId);
    await this.saveDeviceCursor(userId, deviceId, cursor);
    return {
      user,
      device: devices.find((item) => item.id === deviceId) ?? null,
      contacts: contacts.items,
      blocks: blocks.items,
      conversations: conversations.items,
      userSyncCursor: cursor,
      serverTimestamp: Date.now(),
    };
  }

  async messageRange(
    userId: string,
    conversationId: string,
    afterSeq: number | undefined,
    beforeSeq: number | undefined,
    limit: number,
  ): Promise<MessageRange> {
    const member = await this.dataSource.getRepository(ConversationMemberEntity).existsBy({
      userId,
      conversationId,
      status: "ACTIVE",
    });
    if (!member) throw new AppError("CONVERSATION_NOT_FOUND", "Conversation was not found", 404);
    const builder = this.dataSource
      .getRepository(MessageEntity)
      .createQueryBuilder("message")
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
      .where("message.conversation_id = :conversationId", { conversationId })
      .andWhere("hidden.message_id IS NULL");
    if (afterSeq !== undefined) builder.andWhere("message.seq > :afterSeq", { afterSeq });
    if (beforeSeq !== undefined) builder.andWhere("message.seq < :beforeSeq", { beforeSeq });
    const rows = await builder
      .orderBy("message.seq", "ASC")
      .take(limit + 1)
      .getMany();
    return {
      conversationId,
      afterSeq: afterSeq ?? null,
      beforeSeq: beforeSeq ?? null,
      messages: rows.slice(0, limit).map(toMessage),
      hasMore: rows.length > limit,
    };
  }

  private async listEvents(
    userId: string,
    after: number,
    limit: number,
  ): Promise<Omit<SyncResponse, "missingRanges" | "serverTimestamp">> {
    if (limit < 1 || limit > 100)
      throw new AppError("SYNC_LIMIT_INVALID", "Sync limit is invalid", 400);
    const repository = this.dataSource.getRepository(UserSyncEventEntity);
    const oldest = await repository
      .createQueryBuilder("event")
      .where("event.user_id = :userId", { userId })
      .andWhere("(event.expires_at IS NULL OR event.expires_at > now())")
      .orderBy("event.id", "ASC")
      .getOne();
    if (after > 0 && oldest && toSafeNumber(oldest.id) > after + 1) {
      throw new AppError("SYNC_CURSOR_EXPIRED", "The sync cursor is no longer retained", 410, {
        fullSyncRequired: true,
      });
    }
    const rows = await repository
      .createQueryBuilder("event")
      .where("event.user_id = :userId", { userId })
      .andWhere("event.id > :after", { after })
      .andWhere("(event.expires_at IS NULL OR event.expires_at > now())")
      .orderBy("event.id", "ASC")
      .take(limit + 1)
      .getMany();
    const selected = rows.slice(0, limit);
    const cursor = selected.length ? toSafeNumber(selected.at(-1)!.id) : after;
    return {
      userSyncCursor: cursor,
      hasMore: rows.length > limit,
      events: selected.map(toSyncEvent),
    };
  }

  private async findMissingRanges(
    userId: string,
    lastSeq: Record<string, number>,
    events: SyncResponse["events"],
  ): Promise<MessageRange[]> {
    const ranges = new Map<string, { afterSeq: number; beforeSeq: number }>();
    for (const event of events) {
      if (event.eventType !== "message.created.v1" || !event.conversationId || event.seq === null)
        continue;
      const expected = (lastSeq[event.conversationId] ?? 0) + 1;
      if (event.seq > expected) {
        const current = ranges.get(event.conversationId);
        ranges.set(event.conversationId, {
          afterSeq: current?.afterSeq ?? expected - 1,
          beforeSeq: Math.max(current?.beforeSeq ?? 0, event.seq),
        });
      }
    }
    const result: MessageRange[] = [];
    for (const [conversationId, range] of ranges) {
      result.push(
        await this.messageRange(userId, conversationId, range.afterSeq, range.beforeSeq, 100),
      );
    }
    return result;
  }

  private async assertDevice(userId: string, deviceId: string): Promise<void> {
    const device = await this.dataSource.getRepository(DeviceEntity).findOneBy({ id: deviceId });
    if (!device || device.userId !== userId || device.status !== "ACTIVE") {
      throw new AppError("SYNC_DEVICE_FORBIDDEN", "The device cannot sync this user", 403);
    }
  }

  private async latestCursor(userId: string): Promise<number> {
    const row = await this.dataSource
      .getRepository(UserSyncEventEntity)
      .createQueryBuilder("event")
      .select("MAX(event.id)", "max_id")
      .where("event.user_id = :userId", { userId })
      .getRawOne<{ max_id: string | null }>();
    return row?.max_id ? toSafeNumber(row.max_id) : 0;
  }

  private async saveDeviceCursor(userId: string, deviceId: string, cursor: number): Promise<void> {
    await this.dataSource
      .getRepository(DeviceSyncStateEntity)
      .upsert({ userId, deviceId, lastSyncEventId: String(cursor), clientVersion: null }, [
        "userId",
        "deviceId",
      ]);
  }
}

function toSafeNumber(value: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result))
    throw new AppError("INTERNAL_ERROR", "Sync cursor overflow", 500);
  return result;
}
