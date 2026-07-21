import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "friend_requests" })
export class FriendRequestEntity {
  @PrimaryColumn("uuid") id!: string;
  @Column({ name: "requester_id", type: "uuid" }) requesterId!: string;
  @Column({ name: "recipient_id", type: "uuid" }) recipientId!: string;
  @Column({ name: "pair_low", type: "uuid" }) pairLow!: string;
  @Column({ name: "pair_high", type: "uuid" }) pairHigh!: string;
  @Column({ type: "varchar", length: 16, default: "PENDING" }) status!: string;
  @Column({ type: "varchar", length: 200, nullable: true }) message!: string | null;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" }) updatedAt!: Date;
}
