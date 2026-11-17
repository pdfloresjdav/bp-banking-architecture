// Typed API client. Calls go through the Vite proxy (/api, /auth) so cookies stay same-origin;
// the browser never handles access/refresh tokens (the BFF keeps them server-side).

export interface Money {
  amountMinor: number;
  currency: string;
}
export interface Account {
  accountId: string;
  ownerUserId: string;
  product: string;
  balanceMinor: number;
  currency: string;
}
export interface Movement {
  movementId: string;
  accountId: string;
  date: string;
  amountMinor: number;
  currency: string;
  description: string;
}
export interface Paged<T> {
  items: T[];
  nextCursor: string | null;
  pageSize: number;
}
export interface TransferResponse {
  transferId: string;
  state: 'PENDING' | 'SUBMITTED' | 'CONFIRMED' | 'REJECTED' | 'UNKNOWN';
  sourceAccountId: string;
  destinationAccountId: string;
  amount: Money;
  kind: 'OWN' | 'INTERBANK';
  coreReference: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface ApiErrorBody {
  code: string;
  message: string;
  correlationId?: string;
}

export class ApiError extends Error {
  constructor(public status: number, public body: ApiErrorBody) {
    super(body.message || `HTTP ${status}`);
  }
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, (data as ApiErrorBody) ?? { code: 'ERROR', message: res.statusText });
  return data as T;
}

export const api = {
  session: () => fetch('/auth/session', { credentials: 'include' }).then((r) => r.json() as Promise<{ authenticated: boolean; csrf?: string }>),
  logout: () => fetch('/auth/logout', { method: 'POST', credentials: 'include' }),
  me: () => http<{ userId: string; accountsCount: number; detail: unknown }>('/v1/customers/me'),
  accounts: () => http<{ items: Account[] }>('/v1/accounts'),
  movements: (accountId: string, cursor?: string) =>
    http<Paged<Movement> & { _cache?: string }>(`/v1/accounts/${encodeURIComponent(accountId)}/movements${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
  createTransfer: (idempotencyKey: string, csrf: string, body: {
    sourceAccountId: string;
    destinationAccountId: string;
    amount: Money;
    kind: 'OWN' | 'INTERBANK';
    description?: string;
  }) =>
    http<TransferResponse>('/v1/transfers', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey, 'X-CSRF-Token': csrf },
      body: JSON.stringify(body),
    }),
  getTransfer: (id: string) => http<TransferResponse>(`/v1/transfers/${encodeURIComponent(id)}`),
  audit: () => http<{ items: Array<Record<string, unknown>> }>('/v1/audit?limit=25'),
};
