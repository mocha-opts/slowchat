import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";

import { ApiExceptionFilter } from "./api-exception.filter.js";

@Module({
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
export class ErrorHandlingModule {}
