import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "reports" })
export class ReportEntity {
  @PrimaryColumn("uuid") id!: string;
  @Column({ name: "reporter_id", type: "uuid" }) reporterId!: string;
  @Column({ name: "target_user_id", type: "uuid" }) targetUserId!: string;
  @Column({ type: "varchar", length: 32 }) category!: string;
  @Column({ type: "varchar", length: 1000 }) description!: string;
  @Column({ type: "varchar", length: 16, default: "OPEN" }) status!: string;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" }) createdAt!: Date;
}
