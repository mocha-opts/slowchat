import { Module } from "@nestjs/common";

import { AuthValidationModule } from "../auth/auth-validation.module.js";
import { ContactsController } from "./http/contacts.controller.js";
import { ContactService } from "./services/contact.service.js";

@Module({
  imports: [AuthValidationModule],
  controllers: [ContactsController],
  providers: [ContactService],
})
export class ContactsModule {}
