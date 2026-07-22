import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { ConversationMemberEntity } from "../conversations/persistence/entities/conversation-member.entity.js";
import { ConversationUserStateEntity } from "../conversations/persistence/entities/conversation-user-state.entity.js";
import { ConversationEntity } from "../conversations/persistence/entities/conversation.entity.js";
import { MessageEntity } from "../messages/persistence/entities/message.entity.js";
import { ConsumerInboxEventEntity } from "../outbox/persistence/entities/consumer-inbox-event.entity.js";
import { OutboxEventEntity } from "../outbox/persistence/entities/outbox-event.entity.js";
import { GroupInviteEntity } from "../groups/persistence/entities/group-invite.entity.js";
import { GroupJoinRequestEntity } from "../groups/persistence/entities/group-join-request.entity.js";
import { GroupProfileEntity } from "../groups/persistence/entities/group-profile.entity.js";
import { AttachmentEntity } from "../media/persistence/entities/attachment.entity.js";
import { MediaVariantEntity } from "../media/persistence/entities/media-variant.entity.js";
import { UploadSessionEntity } from "../media/persistence/entities/upload-session.entity.js";

export const MESSAGING_ENTITIES = [
  ConversationEntity,
  ConversationMemberEntity,
  ConversationUserStateEntity,
  MessageEntity,
  OutboxEventEntity,
  ConsumerInboxEventEntity,
  GroupProfileEntity,
  GroupJoinRequestEntity,
  GroupInviteEntity,
  UploadSessionEntity,
  AttachmentEntity,
  MediaVariantEntity,
];

@Module({
  imports: [TypeOrmModule.forFeature(MESSAGING_ENTITIES)],
  exports: [TypeOrmModule],
})
export class MessagingPersistenceModule {}
