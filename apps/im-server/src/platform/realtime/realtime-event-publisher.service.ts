import { Inject, Injectable } from "@nestjs/common";
import { Emitter } from "@socket.io/redis-emitter";
import type { WsServerEvent } from "@im/contracts/websocket";
import { v7 as uuidv7 } from "uuid";

import type { ManagedRedis } from "../redis/managed-redis.js";
import { REDIS_REALTIME } from "../redis/redis.tokens.js";
import { RealtimeRoomFactory } from "./realtime-room.factory.js";

@Injectable()
export class RealtimeEventPublisherService {
  private readonly emitter: Emitter;

  constructor(
    @Inject(REDIS_REALTIME) redis: ManagedRedis,
    private readonly rooms: RealtimeRoomFactory,
  ) {
    this.emitter = new Emitter(redis.client);
  }

  async emitToUser(event: string, userId: string, data: unknown): Promise<void> {
    this.emitter.to(this.rooms.user(userId)).emit(event, this.envelope(event, data));
    await Promise.resolve();
  }

  revokeSession(input: { sessionId: string; deviceId: string; reason: string }): Promise<void> {
    const target = this.emitter.to(this.rooms.session(input.sessionId));
    target.emit("session.revoked", this.envelope("session.revoked", input));
    target.disconnectSockets(true);
    return Promise.resolve();
  }

  private envelope(event: string, data: unknown): WsServerEvent {
    return {
      version: 1,
      event,
      eventId: uuidv7(),
      serverTimestamp: Date.now(),
      data,
    };
  }
}
