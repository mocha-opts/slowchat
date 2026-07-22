import {
  createGroupRequestSchema,
  groupInviteSchema,
  groupMemberSchema,
  groupProfileSchema,
  groupJoinRequestSchema,
  updateGroupMemberRequestSchema,
} from "@im/contracts/api";
import { messageSchema, systemMessagePayloadSchema } from "@im/contracts/messages";
import { errorCodeSchema } from "@im/contracts/errors";
import { describe, expect, it } from "vitest";

const ids = {
  user: "019b0000-0000-7000-8000-000000000001",
  peer: "019b0000-0000-7000-8000-000000000002",
  conversation: "019b0000-0000-7000-8000-000000000003",
  message: "019b0000-0000-7000-8000-000000000004",
  device: "019b0000-0000-7000-8000-000000000005",
};

describe("P5 group contracts", () => {
  it("validates group profile, roles and strict update input", () => {
    const profile = groupProfileSchema.parse({
      conversationId: ids.conversation,
      title: "Architecture",
      announcement: null,
      maxMembers: 500,
      joinMode: "INVITE_ONLY",
      allowMemberInvites: false,
      allMembersMuted: false,
      version: 1,
    });
    expect(profile.joinMode).toBe("INVITE_ONLY");
    expect(createGroupRequestSchema.parse({ title: "Chat" }).maxMembers).toBe(500);
    expect(updateGroupMemberRequestSchema.safeParse({ role: "OWNER" }).success).toBe(false);
  });

  it("validates lifecycle records and shared-sequence system messages", () => {
    const system = messageSchema.parse({
      id: ids.message,
      conversationId: ids.conversation,
      seq: 1,
      senderId: ids.user,
      senderDeviceId: ids.device,
      clientMessageId: ids.message,
      type: "SYSTEM",
      contentVersion: 1,
      payload: { kind: "MEMBER_JOINED", actorUserId: ids.user, targetUserId: ids.peer },
      textPreview: "MEMBER_JOINED",
      countsUnread: false,
      createdAt: new Date().toISOString(),
    });
    expect(system.type).toBe("SYSTEM");
    expect(groupMemberSchema.safeParse({}).success).toBe(false);
    expect(groupJoinRequestSchema.safeParse({}).success).toBe(false);
    expect(groupInviteSchema.safeParse({}).success).toBe(false);
    expect(
      systemMessagePayloadSchema.safeParse({ kind: "UNKNOWN", actorUserId: ids.user }).success,
    ).toBe(false);
  });

  it("keeps group-specific errors stable", () => {
    for (const code of [
      "CONVERSATION_NOT_FOUND",
      "CONVERSATION_FORBIDDEN",
      "CONVERSATION_CONFLICT",
      "MESSAGE_FORBIDDEN",
    ])
      expect(errorCodeSchema.safeParse(code).success).toBe(true);
  });

  it("accepts bounded member mentions without changing the text version", () => {
    const value = messageSchema.parse({
      id: ids.message,
      conversationId: ids.conversation,
      seq: 2,
      senderId: ids.user,
      senderDeviceId: ids.device,
      clientMessageId: ids.message,
      type: "TEXT",
      contentVersion: 1,
      payload: { text: "hello @member", mentions: [ids.peer], mentionAll: false },
      textPreview: "hello @member",
      countsUnread: true,
      createdAt: new Date().toISOString(),
    });
    expect(value.type === "TEXT" && value.payload.mentions).toEqual([ids.peer]);
  });
});
