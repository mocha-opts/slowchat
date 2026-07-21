import type { ApiErrorEnvelope, ErrorCode } from "@im/contracts/errors";
import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { PinoLogger } from "nestjs-pino";

import { RequestContextService } from "../../platform/request-context/request-context.service.js";
import { AppError } from "./app-error.js";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly logger: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const requestId =
      this.requestContext.get()?.requestId ??
      response.getHeader("X-Request-Id")?.toString() ??
      "unknown";

    const mapped = this.mapException(exception);
    if (mapped.statusCode >= 500) {
      this.logger.error({ err: exception, requestId, path: request.path }, mapped.message);
    }

    const body: ApiErrorEnvelope = {
      requestId,
      code: mapped.code,
      message: mapped.message,
      details: mapped.details,
      timestamp: Date.now(),
    };
    response.status(mapped.statusCode).json(body);
  }

  private mapException(exception: unknown): {
    code: ErrorCode;
    details: Record<string, unknown>;
    message: string;
    statusCode: number;
  } {
    if (exception instanceof AppError) {
      return exception;
    }
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const payload = exception.getResponse();
      return {
        code: statusCode === 404 ? "NOT_FOUND" : "VALIDATION_ERROR",
        details: typeof payload === "object" ? { response: payload } : {},
        message: exception.message,
        statusCode,
      };
    }
    return {
      code: "INTERNAL_ERROR",
      details: {},
      message: "An unexpected error occurred",
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    };
  }
}
