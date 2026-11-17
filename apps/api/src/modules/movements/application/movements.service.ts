import { Paged } from '@bp/contracts';
import { cacheAside, CachePort, CoreMovement, CorePort, AccountAuthorizationError } from '@bp/domain';
import { AccountAuthorizationPort } from '../../transfers/application/transfer.service';

/** Movement query with Cache-Aside and per-account authorization (seq-07). */
export class MovementsService {
  constructor(
    private readonly core: CorePort,
    private readonly cache: CachePort,
    private readonly accounts: AccountAuthorizationPort,
    private readonly ttlSeconds: number,
  ) {}

  async list(params: {
    userId: string;
    accountId: string;
    cursor: string | null;
    limit: number;
  }): Promise<{ data: Paged<CoreMovement>; cacheHit: boolean }> {
    // Authorization: the account must belong to the user.
    const authorized = await this.accounts.canDebit(params.userId, params.accountId);
    if (!authorized) throw new AccountAuthorizationError(params.accountId);

    const limit = Math.min(Math.max(params.limit, 1), 100);
    const key = `movements:${params.accountId}:${params.cursor ?? 'first'}:${limit}`;
    const result = await cacheAside<Paged<CoreMovement>>(this.cache, key, this.ttlSeconds, () =>
      this.core.getMovements(params.accountId, params.cursor, limit),
    );
    return { data: result.value, cacheHit: result.hit };
  }
}
