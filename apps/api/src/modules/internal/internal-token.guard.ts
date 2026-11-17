import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AppConfig } from '../../config/configuration';
import { TOKENS } from '../../common/tokens';

/**
 * Guards internal operational endpoints with a shared token (X-Internal-Token).
 * This is isolated from end-user authentication and must be set via INTERNAL_API_TOKEN.
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  constructor(@Inject(TOKENS.Config) private readonly cfg: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.headers['x-internal-token'];
    if (!token || token !== this.cfg.internalApiToken) {
      throw new UnauthorizedException('Invalid internal token');
    }
    return true;
  }
}
