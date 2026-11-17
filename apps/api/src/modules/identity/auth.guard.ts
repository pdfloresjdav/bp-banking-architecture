import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import type Redis from 'ioredis';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { AppConfig } from '../../config/configuration';
import { TOKENS } from '../../common/tokens';

export interface AuthUser {
  userId: string;
  scopes: string[];
  stepup: boolean;
}

type JwksResolver = ReturnType<typeof createRemoteJWKSet>;

/**
 * Authentication guard.
 * - Production/local with Keycloak: validates a JWT (mobile Bearer, or web via the BFF session cookie)
 *   against the IdP JWKS.
 * - DEV_AUTH_BYPASS=true: LOCAL/HTTP PoC testing ONLY (never in production); isolated behind a flag.
 *
 * Web requests authenticated by the session cookie also require CSRF protection (double-submit) on
 * state-changing methods.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private jwks?: JwksResolver;

  constructor(
    @Inject(TOKENS.Config) private readonly cfg: AppConfig,
    @Inject(TOKENS.Redis) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();

    if (this.cfg.devAuthBypass) {
      const userId = (req.headers['x-debug-user'] as string) || 'user-1';
      const stepup = (req.headers['x-debug-stepup'] as string) === 'true';
      req.user = { userId, scopes: ['customer.read', 'transfer.write'], stepup };
      return true;
    }

    // 1) Mobile / API: Bearer token.
    const bearer = this.extractBearer(req);
    if (bearer) {
      req.user = this.toUser(await this.verify(bearer));
      return true;
    }

    // 2) Web: server-side session referenced by an HttpOnly cookie.
    const sessionId = req.cookies?.[this.cfg.bff.cookieName];
    if (!sessionId) throw new UnauthorizedException('Not authenticated');
    const raw = await this.redis.get(`session:${sessionId}`);
    if (!raw) throw new UnauthorizedException('Session expired or missing');
    const session = JSON.parse(raw) as { accessToken: string; csrf: string };

    // CSRF double-submit for state-changing methods.
    const method = req.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      const header = req.headers['x-csrf-token'];
      if (!header || header !== session.csrf) throw new ForbiddenException('CSRF token mismatch');
    }

    req.user = this.toUser(await this.verify(session.accessToken));
    return true;
  }

  private extractBearer(req: Request): string | null {
    const auth = req.headers.authorization;
    return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  }

  private async verify(token: string): Promise<JWTPayload> {
    if (!this.jwks) this.jwks = createRemoteJWKSet(new URL(this.cfg.oidc.jwksUri));
    try {
      const { payload } = await jwtVerify(token, this.jwks, { issuer: this.cfg.oidc.issuer });
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private toUser(payload: JWTPayload): AuthUser {
    const scope = (payload.scope as string) ?? '';
    return {
      userId: String(payload.sub),
      scopes: scope.split(' ').filter(Boolean),
      stepup: (payload.acr as string) === 'stepup',
    };
  }
}
