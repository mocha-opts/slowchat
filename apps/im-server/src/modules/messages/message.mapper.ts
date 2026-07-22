import type { Message } from "@im/contracts/messages";

import type { MessageEntity } from "./persistence/entities/message.entity.js";

export function toMessage(message: MessageEntity): Message {
  const text = typeof message.payload.text === "string" ? message.payload.text : "";
  return {
    id: message.id,
    conversationId: message.conversationId,
    seq: message.seq,
    senderId: message.senderId,
    senderDeviceId: message.senderDeviceId,
    clientMessageId: message.clientMessageId,
    type: "TEXT",
    contentVersion: 1,
    payload: { text },
    textPreview: message.textPreview,
    countsUnread: message.countsUnread,
    createdAt: message.createdAt.toISOString(),
  };
}
