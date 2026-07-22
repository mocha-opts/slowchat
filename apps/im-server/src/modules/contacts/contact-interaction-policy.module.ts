import { Module } from "@nestjs/common";

import { ContactInteractionPolicyService } from "./services/contact-interaction-policy.service.js";

@Module({
  providers: [ContactInteractionPolicyService],
  exports: [ContactInteractionPolicyService],
})
export class ContactInteractionPolicyModule {}
