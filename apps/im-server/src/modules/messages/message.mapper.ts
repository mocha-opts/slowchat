import {
  filePayloadSchema,
  imagePayloadSchema,
  systemMessagePayloadSchema,
  textPayloadSchema,
  type Message,
} from "@im/contracts/messages";

import type { MessageEntity } from "./persistence/entities/message.entity.js";

export function toMessage(message: MessageEntity): Message {
  if (message.type === "SYSTEM") {
    return {
      id: message.id,
      conversationId: message.conversationId,
      seq: message.seq,
      senderId: message.senderId,
      senderDeviceId: message.senderDeviceId,
      clientMessageId: message.clientMessageId,
      type: "SYSTEM",
      contentVersion: 1,
      payload: systemMessagePayloadSchema.parse(message.payload),
      textPreview: message.textPreview,
      countsUnread: message.countsUnread,
      createdAt: message.createdAt.toISOString(),
    };
  }
  if (message.type === "IMAGE") {
    return {
      id: message.id,
      conversationId: message.conversationId,
      seq: message.seq,
      senderId: message.senderId,
      senderDeviceId: message.senderDeviceId,
      clientMessageId: message.clientMessageId,
      type: "IMAGE",
      contentVersion: 1,
      payload: imagePayloadSchema.parse(message.payload),
      textPreview: message.textPreview,
      countsUnread: message.countsUnread,
      createdAt: message.createdAt.toISOString(),
    };
  }
  if (message.type === "FILE") {
    return {
      id: message.id,
      conversationId: message.conversationId,
      seq: message.seq,
      senderId: message.senderId,
      senderDeviceId: message.senderDeviceId,
      clientMessageId: message.clientMessageId,
      type: "FILE",
      contentVersion: 1,
      payload: filePayloadSchema.parse(message.payload),
      textPreview: message.textPreview,
      countsUnread: message.countsUnread,
      createdAt: message.createdAt.toISOString(),
    };
  }
  const payload = textPayloadSchema.parse(message.payload);
  return {
    id: message.id,
    conversationId: message.conversationId,
    seq: message.seq,
    senderId: message.senderId,
    senderDeviceId: message.senderDeviceId,
    clientMessageId: message.clientMessageId,
    type: "TEXT",
    contentVersion: 1,
    payload,
    textPreview: message.textPreview,
    countsUnread: message.countsUnread,
    createdAt: message.createdAt.toISOString(),
  };
}
