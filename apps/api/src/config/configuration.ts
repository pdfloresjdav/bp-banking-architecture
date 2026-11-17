/** Environment-variable configuration (no real secrets in the repo). */
export interface AppConfig {
  port: number;
  nodeEnv: string;
  database: { host: string; port: number; user: string; password: string; name: string };
  redis: { host: string; port: number };
  rabbit: { url: string };
  core: { baseUrl: string; timeoutMs: number };
  complementary: { baseUrl: string };
  oidc: { issuer: string; clientId: string; clientSecret: string; redirectUri: string; jwksUri: string };
  bff: { sessionSecret: string; cookieName: string; postLoginRedirect: string };
  /** Auth bypass for LOCAL/HTTP PoC testing ONLY (never in production). */
  devAuthBypass: boolean;
  /** Shared token protecting internal operational endpoints (e.g. reconciliation). */
  internalApiToken: string;
  cacheTtlSeconds: number;
}

function int(v: string | undefined, def: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

export function loadConfig(): AppConfig {
  const env = process.env;
  return {
    port: int(env.API_PORT, 3001),
    nodeEnv: env.NODE_ENV ?? 'development',
    database: {
      host: env.POSTGRES_HOST ?? 'localhost',
      port: int(env.POSTGRES_PORT, 5432),
      user: env.POSTGRES_USER ?? 'bp',
      password: env.POSTGRES_PASSWORD ?? 'bp',
      name: env.POSTGRES_DB ?? 'bp',
    },
    redis: { host: env.REDIS_HOST ?? 'localhost', port: int(env.REDIS_PORT, 6379) },
    rabbit: { url: env.RABBITMQ_URL ?? 'amqp://bp:bp@localhost:5672' },
    core: { baseUrl: env.CORE_BASE_URL ?? 'http://localhost:8090', timeoutMs: int(env.CORE_TIMEOUT_MS, 2500) },
    complementary: { baseUrl: env.COMPLEMENTARY_BASE_URL ?? 'http://localhost:8091' },
    oidc: {
      issuer: env.OIDC_ISSUER ?? 'http://localhost:8088/realms/bp',
      clientId: env.OIDC_CLIENT_ID ?? 'bp-web',
      clientSecret: env.OIDC_CLIENT_SECRET ?? 'dev-only-not-a-secret',
      redirectUri: env.OIDC_REDIRECT_URI ?? 'http://localhost:3001/auth/callback',
      jwksUri: env.OIDC_JWKS_URI ?? 'http://localhost:8088/realms/bp/protocol/openid-connect/certs',
    },
    bff: {
      sessionSecret: env.BFF_SESSION_SECRET ?? 'dev-only-session-secret',
      cookieName: env.BFF_COOKIE_NAME ?? 'bp_session',
      postLoginRedirect: env.BFF_POST_LOGIN_REDIRECT ?? 'http://localhost:5173/',
    },
    devAuthBypass: (env.DEV_AUTH_BYPASS ?? 'false') === 'true',
    internalApiToken: env.INTERNAL_API_TOKEN ?? 'dev-only-internal-token',
    cacheTtlSeconds: int(env.CACHE_TTL_SECONDS, 60),
  };
}

export const CONFIG = Symbol('CONFIG');
