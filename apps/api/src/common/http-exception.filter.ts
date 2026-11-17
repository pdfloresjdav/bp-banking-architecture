import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { DomainError } from '@bp/domain';
import { ApiError } from '@bp/contracts';
import { StructuredLogger } from '@bp/shared';

const logger = new StructuredLogger('HttpExceptionFilter');

/** Manejo estandarizado de errores → envelope ApiError, mapea DomainError. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { correlationId?: string }>();
    const correlationId = req.correlationId;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ApiError = { code: 'INTERNAL_ERROR', message: 'Error interno', correlationId };

    if (exception instanceof DomainError) {
      status = exception.httpStatus;
      body = { code: exception.code, message: exception.message, correlationId };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resp = exception.getResponse();
      const message = typeof resp === 'string' ? resp : ((resp as { message?: unknown }).message as string) ?? exception.message;
      body = { code: `HTTP_${status}`, message: Array.isArray(message) ? message.join('; ') : String(message), correlationId };
    } else if (exception instanceof Error) {
      logger.error('Unhandled error', { correlationId, error: exception.message });
    }

    res.status(status).json(body);
  }
}
