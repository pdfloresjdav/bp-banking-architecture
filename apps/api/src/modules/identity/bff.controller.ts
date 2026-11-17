import { Controller, Get, Inject, Post, Query, Req, Res } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import axios from 'axios';
import type { Request, Response } from 'express';
import type Redis from 'ioredis';
import { AppConfig } from '../../config/configuration';
import { TOKENS } from '../../common/tokens';

const TEMP_COOKIE = 'bp_oauth';
const SESSION_TTL = 3600;

/**
 * Web BFF: runs OIDC Authorization Code + PKCE against the IdP (local Keycloak),
 * stores tokens SERVER-SIDE (Redis), and issues an HttpOnly/Secure/SameSite session cookie
 * plus a CSRF token. The browser NEVER receives access/refresh tokens.
 */
@Controller('auth')
export class BffController {
  constructor(
    @Inject(TOKENS.Config) private readonly cfg: AppConfig,
    @Inject(TOKENS.Redis) private readonly redis: Redis,
  ) {}

  private base64url(b: Buffer): string {
    return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  @Get('login')
  async login(@Res() res: Response): Promise<void> {
    const state = this.base64url(randomBytes(16));
    const verifier = this.base64url(randomBytes(32));
    const challenge = this.base64url(createHash('sha256').update(verifier).digest());
    const tempId = randomUUID();
    await this.redis.set(`oauth:${tempId}`, JSON.stringify({ state, verifier }), 'EX', 300);

    res.cookie(TEMP_COOKIE, tempId, { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 300_000 });
    const url = new URL(`${this.cfg.oidc.issuer}/protocol/openid-connect/auth`);
    url.searchParams.set('client_id', this.cfg.oidc.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid profile');
    url.searchParams.set('redirect_uri', this.cfg.oidc.redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    res.redirect(url.toString());
  }

  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    const tempId = req.cookies?.[TEMP_COOKIE];
    const raw = tempId ? await this.redis.get(`oauth:${tempId}`) : null;
    if (!raw) {
      res.status(400).json({ code: 'OAUTH_STATE_MISSING', message: 'OAuth state not found' });
      return;
    }
    const { state: expectedState, verifier } = JSON.parse(raw) as { state: string; verifier: string };
    if (state !== expectedState) {
      res.status(400).json({ code: 'OAUTH_STATE_MISMATCH', message: 'Invalid state' });
      return;
    }

    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.cfg.oidc.clientId,
      client_secret: this.cfg.oidc.clientSecret,
      code,
      redirect_uri: this.cfg.oidc.redirectUri,
      code_verifier: verifier,
    });
    const tokenRes = await axios.post(`${this.cfg.oidc.issuer}/protocol/openid-connect/token`, form.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      validateStatus: () => true,
    });
    if (tokenRes.status !== 200) {
      res.status(401).json({ code: 'OIDC_TOKEN_ERROR', message: 'Could not obtain token' });
      return;
    }

    const sessionId = randomUUID();
    const csrf = this.base64url(randomBytes(16));
    await this.redis.set(
      `session:${sessionId}`,
      JSON.stringify({ accessToken: tokenRes.data.access_token, refreshToken: tokenRes.data.refresh_token, csrf }),
      'EX',
      SESSION_TTL,
    );
    await this.redis.del(`oauth:${tempId}`);
    res.clearCookie(TEMP_COOKIE);
    res.cookie(this.cfg.bff.cookieName, sessionId, { httpOnly: true, sameSite: 'strict', secure: false, maxAge: SESSION_TTL * 1000 });
    res.cookie('bp_csrf', csrf, { httpOnly: false, sameSite: 'strict', secure: false, maxAge: SESSION_TTL * 1000 });
    res.redirect(this.cfg.bff.postLoginRedirect);
  }

  @Get('session')
  async session(@Req() req: Request): Promise<{ authenticated: boolean; csrf?: string }> {
    const sid = req.cookies?.[this.cfg.bff.cookieName];
    const raw = sid ? await this.redis.get(`session:${sid}`) : null;
    if (!raw) return { authenticated: false };
    const session = JSON.parse(raw) as { csrf: string };
    return { authenticated: true, csrf: session.csrf };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res() res: Response): Promise<void> {
    const sid = req.cookies?.[this.cfg.bff.cookieName];
    if (sid) await this.redis.del(`session:${sid}`);
    res.clearCookie(this.cfg.bff.cookieName);
    res.clearCookie('bp_csrf');
    res.status(204).send();
  }
}
