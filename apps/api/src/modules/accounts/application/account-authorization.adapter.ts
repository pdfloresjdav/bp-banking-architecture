import { CorePort } from '@bp/domain';
import { AccountAuthorizationPort } from '../../transfers/application/transfer.service';

/**
 * Source-account authorization: the user may debit the account if it appears among their
 * accounts in the Core (the subject's ownership over the SOURCE account).
 */
export class CoreAccountAuthorizationAdapter implements AccountAuthorizationPort {
  constructor(private readonly core: CorePort) {}

  async canDebit(userId: string, accountId: string): Promise<boolean> {
    const accounts = await this.core.getAccounts(userId);
    return accounts.some((a) => a.accountId === accountId);
  }
}
