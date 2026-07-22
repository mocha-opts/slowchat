import { Inject } from "@nestjs/common";
import {
  SubscribeMessage,
  WebSocketGateway,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from "@nestjs/websockets";
import { PinoLogger } from "nestjs-pino";
import { v7 as uuidv7 } from "uuid";

import { AuthSessionService } from "../modules/auth/services/auth-session.service.js";
import { TokenService } from "../modules/auth/services/token.service.js";
import { APP_CONFIG, type AppConfig } from "../platform/config/app-config.js";
import { RealtimeRoomFactory } from "../platform/realtime/realtime-room.factory.js";
import type { AuthenticatedSocket } from "./authenticated-socket.js";
import { RealtimeCommandHandler } from "./realtime-command.handler.js";

@WebSocketGateway({ cors: false, maxHttpBufferSize: 64 * 1024 })
export class PlatformGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly tokens: TokenService,
    private readonly sessions: AuthSessionService,
    private readonly rooms: RealtimeRoomFactory,
    private readonly commands: RealtimeCommandHandler,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PlatformGateway.name);
  }

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      this.assertOrigin(client.handshake.headers.origin);
      const context = await this.tokens.verifyAccessToken(this.bearerToken(client));
      await this.sessions.validate(context);
      client.data.auth = context;
      await client.join([
        this.rooms.user(context.userId),
        this.rooms.device(context.deviceId),
        this.rooms.session(context.sessionId),
      ]);
      client.emit("connection.ready", {
        version: 1,
        event: "connection.ready",
        eventId: uuidv7(),
        serverTimestamp: Date.now(),
        data: { userId: context.userId, deviceId: context.deviceId, sessionId: context.sessionId },
      });
      this.logger.debug({ socketId: client.id, userId: context.userId }, "Socket authenticated");
    } catch (error) {
      this.logger.warn({ err: error, socketId: client.id }, "Socket authentication rejected");
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    this.logger.debug({ socketId: client.id }, "Socket disconnected");
  }

  @SubscribeMessage("message.send")
  messageSend(client: AuthenticatedSocket, payload: unknown) {
    return this.commands.send(client, payload);
  }

  @SubscribeMessage("message.delivered")
  messageDelivered(client: AuthenticatedSocket, payload: unknown) {
    return this.commands.delivered(client, payload);
  }

  @SubscribeMessage("conversation.read")
  conversationRead(client: AuthenticatedSocket, payload: unknown) {
    return this.commands.read(client, payload);
  }

  private bearerToken(client: AuthenticatedSocket): string {
    const handshakeAuth = client.handshake.auth as Record<string, unknown>;
    const authToken = handshakeAuth.token;
    if (typeof authToken === "string" && authToken.length > 0) return authToken;
    const authorization = client.handshake.headers.authorization;
    if (authorization?.startsWith("Bearer ")) return authorization.slice(7);
    throw new Error("Access token is missing");
  }

  private assertOrigin(origin: string | undefined): void {
    if (!origin) return;
    if (!this.config.auth.allowedWsOrigins.includes(origin))
      throw new Error("Origin is not allowed");
  }
}
