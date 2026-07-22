import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { GroupInviteEntity } from "./entities/group-invite.entity.js";
import { GroupJoinRequestEntity } from "./entities/group-join-request.entity.js";
import { GroupProfileEntity } from "./entities/group-profile.entity.js";

export const GROUP_ENTITIES = [GroupProfileEntity, GroupJoinRequestEntity, GroupInviteEntity];

@Module({
  imports: [TypeOrmModule.forFeature(GROUP_ENTITIES)],
  exports: [TypeOrmModule],
})
export class GroupsPersistenceModule {}
