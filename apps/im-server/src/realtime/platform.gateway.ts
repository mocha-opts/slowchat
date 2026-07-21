import { Logger } from "@nestjs/common";
import {
  WebSocketGateway,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from "@nestjs/websockets";
import type { Socket } from "socket.io";

@WebSocketGateway({ cors: false })
export class PlatformGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(PlatformGateway.name);

  handleConnection(client: Socket): void {
    this.logger.debug(`Socket connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Socket disconnected: ${client.id}`);
  }
}
