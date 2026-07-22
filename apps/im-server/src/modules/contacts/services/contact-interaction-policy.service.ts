import { Injectable } from "@nestjs/common";
import type { EntityManager } from "typeorm";

import { AppError } from "../../../common/errors/app-error.js";
import { UserPrivacySettingsEntity } from "../../users/persistence/entities/user-privacy-settings.entity.js";
import { BlockEntity } from "../persistence/entities/block.entity.js";
import { FriendshipEntity } from "../persistence/entities/friendship.entity.js";

@Injectable()
export class ContactInteractionPolicyService {
  async assertDirectCreationAllowed(
    manager: EntityManager,
    requesterId: string,
    recipientId: string,
  ): Promise<void> {
    await this.assertNotBlocked(manager, requesterId, recipientId, "CONVERSATION_FORBIDDEN");
    const contact = await manager
      .getRepository(FriendshipEntity)
      .existsBy({ userId: requesterId, contactUserId: recipientId });
    if (contact) return;
    const privacy = await manager
      .getRepository(UserPrivacySettingsEntity)
      .findOneBy({ userId: recipientId });
    if (!privacy?.allowStrangerMessages) {
      throw new AppError("CONVERSATION_FORBIDDEN", "Direct conversation is not permitted", 403);
    }
  }

  async assertDirectMessagingAllowed(
    manager: EntityManager,
    senderId: string,
    recipientId: string,
  ): Promise<void> {
    await this.assertNotBlocked(manager, senderId, recipientId, "MESSAGE_FORBIDDEN");
  }

  private async assertNotBlocked(
    manager: EntityManager,
    left: string,
    right: string,
    code: "CONVERSATION_FORBIDDEN" | "MESSAGE_FORBIDDEN",
  ): Promise<void> {
    const blocked = await manager.getRepository(BlockEntity).exists({
      where: [
        { userId: left, blockedUserId: right },
        { userId: right, blockedUserId: left },
      ],
    });
    if (blocked) throw new AppError(code, "Interaction is blocked", 403);
  }
}
