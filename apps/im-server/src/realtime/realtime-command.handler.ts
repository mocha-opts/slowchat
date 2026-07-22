import { Injectable } from "@nestjs/common";
import {
  conversationReadCommandSchema,
  messageDeliveredCommandSchema,
  messageSendCommandSchema,
  type WsAck,
  type WsServerEvent,
} from "@im/contracts/websocket";
import { parseContract } from "../common/contracts/parse-contract.js";
import { AppError } from "../common/errors/app-error.js";
import { ConversationCommandService } from "../modules/conversations/services/conversation-command.service.js";
import { MessageCommandService } from "../modules/messages/services/message-command.service.js";
import type { AuthenticatedSocket } from "./authenticated-socket.js";

@Injectable()
export class RealtimeCommandHandler {
  constructor(
    private readonly messages: MessageCommandService,
    private readonly conversations: ConversationCommandService,
  ) {}

  async send(client: AuthenticatedSocket, value: unknown): Promise<WsAck> {
    let requestId = requestIdOf(value);
    try {
      const command = parseContract(messageSendCommandSchema, value);
      requestId = command.requestId;
      const auth = this.auth(client, command.deviceId);
      const accepted = await this.messages.sendText(
        auth,
        command.data.conversationId,
        command.data,
        { requestId: command.requestId },
      );
      const event: WsServerEvent = {
        version: 1,
        event: "message.accepted",
        eventId: accepted.messageId,
        serverTimestamp: Date.now(),
        data: accepted,
      };
      client.emit("message.accepted", event);
      return ok(command.requestId, accepted);
    } catch (error) {
      return failure(requestId, error);
    }
  }

  async delivered(client: AuthenticatedSocket, value: unknown): Promise<WsAck> {
    let requestId = requestIdOf(value);
    try {
      const command = parseContract(messageDeliveredCommandSchema, value);
      requestId = command.requestId;
      const receipt = await this.conversations.delivered(
        this.auth(client, command.deviceId),
        command.data.conversationId,
        command.data.lastDeliveredSeq,
        { requestId: command.requestId },
      );
      return ok(command.requestId, receipt);
    } catch (error) {
      return failure(requestId, error);
    }
  }

  async read(client: AuthenticatedSocket, value: unknown): Promise<WsAck> {
    let requestId = requestIdOf(value);
    try {
      const command = parseContract(conversationReadCommandSchema, value);
      requestId = command.requestId;
      const receipt = await this.conversations.read(
        this.auth(client, command.deviceId),
        command.data.conversationId,
        command.data.lastReadSeq,
        { requestId: command.requestId },
      );
      return ok(command.requestId, receipt);
    } catch (error) {
      return failure(requestId, error);
    }
  }

  private auth(client: AuthenticatedSocket, deviceId: string) {
    const auth = client.data.auth;
    if (!auth) throw new AppError("UNAUTHORIZED", "Authentication is required", 401);
    if (auth.deviceId !== deviceId) {
      throw new AppError("FORBIDDEN", "Command device does not match the session", 403);
    }
    return auth;
  }
}

function ok<T>(requestId: string, data: T): WsAck<T> {
  return { requestId, ok: true, code: "OK", data, serverTimestamp: Date.now() };
}

function failure(requestId: string, error: unknown): WsAck {
  if (error instanceof AppError) {
    return {
      requestId,
      ok: false,
      code: error.code,
      message: error.message,
      serverTimestamp: Date.now(),
    };
  }
  return {
    requestId,
    ok: false,
    code: "INTERNAL_ERROR",
    message: "An internal error occurred",
    serverTimestamp: Date.now(),
  };
}

function requestIdOf(value: unknown): string {
  if (typeof value !== "object" || value === null || !("requestId" in value)) return "unknown";
  return typeof value.requestId === "string" && value.requestId.length > 0
    ? value.requestId.slice(0, 128)
    : "unknown";
}
