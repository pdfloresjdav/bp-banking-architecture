import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { CORRELATION_HEADER, newCorrelationId } from '@bp/shared';

/** Propagates/creates the correlationId on every request. */
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = (req.headers[CORRELATION_HEADER] as string) || newCorrelationId();
    (req as Request & { correlationId: string }).correlationId = incoming;
    res.setHeader(CORRELATION_HEADER, incoming);
    next();
  }
}
