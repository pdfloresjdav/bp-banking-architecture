import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthUser } from './auth.guard';

/** Injects the authenticated user and the correlationId into controllers. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
  if (!req.user) throw new Error('No user in context (is AuthGuard missing?)');
  return req.user;
});

export const CorrelationId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<Request & { correlationId?: string }>();
  return req.correlationId ?? 'unknown';
});
