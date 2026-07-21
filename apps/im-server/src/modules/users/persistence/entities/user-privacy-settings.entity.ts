import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "user_privacy_settings" })
export class UserPrivacySettingsEntity {
  @PrimaryColumn({ name: "user_id", type: "uuid" }) userId!: string;
  @Column({ name: "search_audience", type: "varchar", length: 16, default: "EVERYONE" })
  searchAudience!: string;
  @Column({ name: "friend_request_audience", type: "varchar", length: 16, default: "EVERYONE" })
  friendRequestAudience!: string;
  @Column({ name: "group_invite_audience", type: "varchar", length: 16, default: "CONTACTS" })
  groupInviteAudience!: string;
  @Column({ name: "online_status_audience", type: "varchar", length: 16, default: "CONTACTS" })
  onlineStatusAudience!: string;
  @Column({ name: "last_seen_audience", type: "varchar", length: 16, default: "CONTACTS" })
  lastSeenAudience!: string;
  @Column({ name: "allow_stranger_messages", type: "boolean", default: false })
  allowStrangerMessages!: boolean;
  @Column({ name: "allow_bot_direct_messages", type: "boolean", default: false })
  allowBotDirectMessages!: boolean;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" }) updatedAt!: Date;
}
