/**
 * Real authentication E2E (NO dev bypass).
 * Obtains a genuine access token from Keycloak and validates that the backend AuthGuard verifies it
 * against the IdP JWKS. The interactive Authorization Code + PKCE browser flow is exercised by the BFF
 * (bp-bff-web) and is documented as a manual step; here we validate backend token verification end-to-end.
 *
 * REQUIRES Docker services: keycloak (realm bp with the TEST-ONLY bp-test client), postgres, redis,
 * rabbitmq, wiremock-core. Run with DEV_AUTH_BYPASS=false:
 *   DEV_AUTH_BYPASS=false pnpm --filter @bp/api exec jest --config test/jest-e2e.config.js test/auth.e2e-spec.ts --runInBand --forceExit
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import axios from 'axios';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';

process.env.DEV_AUTH_BYPASS = 'false';

const KEYCLOAK = process.env.OIDC_ISSUER ?? 'http://localhost:8088/realms/bp';

async function getRealToken(): Promise<string> {
  const form = new URLSearchParams({
    grant_type: 'password',
    client_id: 'bp-test',
    client_secret: 'test-only-secret',
    username: 'demo',
    password: 'demo',
    scope: 'openid',
  });
  const res = await axios.post(`${KEYCLOAK}/protocol/openid-connect/token`, form.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return res.data.access_token as string;
}

describe('Real authentication (e2e, no bypass, requires Keycloak)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    token = await getRealToken();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('obtains a real access token from Keycloak', () => {
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3); // JWT
  });

  it('rejects a request without a token → 401', async () => {
    await request(app.getHttpServer()).get('/v1/accounts').expect(401);
  });

  it('rejects an invalid token → 401', async () => {
    await request(app.getHttpServer()).get('/v1/accounts').set('Authorization', 'Bearer not-a-valid-jwt').expect(401);
  });

  it('accepts a valid Keycloak token (JWKS verification) → 200', async () => {
    const res = await request(app.getHttpServer()).get('/v1/accounts').set('Authorization', `Bearer ${token}`).expect(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });
});
