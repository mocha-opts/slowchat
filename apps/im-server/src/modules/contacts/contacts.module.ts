import { Module } from "@nestjs/common";

import { AuthValidationModule } from "../auth/auth-validation.module.js";
import { ContactInteractionPolicyModule } from "./contact-interaction-policy.module.js";
import { ContactsController } from "./http/contacts.controller.js";
import { ContactService } from "./services/contact.service.js";

@Module({
  imports: [AuthValidationModule, ContactInteractionPolicyModule],
  controllers: [ContactsController],
  providers: [ContactService],
  exports: [ContactService],
})
export class ContactsModule {}
