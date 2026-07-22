import { Global, Module } from "@nestjs/common";

import { RabbitMqService } from "./rabbitmq.service.js";

@Global()
@Module({
  providers: [RabbitMqService],
  exports: [RabbitMqService],
})
export class RabbitMqModule {}
