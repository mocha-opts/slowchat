import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { ConversationMemberEntity } from "../conversations/persistence/entities/conversation-member.entity.js";
import { ConversationUserStateEntity } from "../conversations/persistence/entities/conversation-user-state.entity.js";
import { ConversationEntity } from "../conversations/persistence/entities/conversation.entity.js";
import { MessageEntity } from "../messages/persistence/entities/message.entity.js";
import { ConsumerInboxEventEntity } from "../outbox/persistence/entities/consumer-inbox-event.entity.js";
import { OutboxEventEntity } from "../outbox/persistence/entities/outbox-event.entity.js";

export const MESSAGING_ENTITIES = [
  ConversationEntity,
  ConversationMemberEntity,
  ConversationUserStateEntity,
  MessageEntity,
  OutboxEventEntity,
  ConsumerInboxEventEntity,
];

@Module({
  imports: [TypeOrmModule.forFeature(MESSAGING_ENTITIES)],
  exports: [TypeOrmModule],
})
export class MessagingPersistenceModule {}
