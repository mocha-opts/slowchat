import { CreateDateColumn, Entity, PrimaryColumn } from "typeorm";

/** 每用户独立隐藏消息；删除自己的视图不会改写其他成员看到的消息事实。 */
@Entity({ name: "message_user_hides" })
export class MessageUserHideEntity {
  @PrimaryColumn({ name: "user_id", type: "uuid" }) userId!: string;
  @PrimaryColumn({ name: "message_id", type: "uuid" }) messageId!: string;
  @CreateDateColumn({ name: "hidden_at", type: "timestamptz" }) hiddenAt!: Date;
}
