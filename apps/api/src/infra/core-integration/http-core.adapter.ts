import { CoreTransferOutcome, Paged } from '@bp/contracts';
import { CoreAccount, CoreMovement, CorePort, CorePostTransferInput } from '@bp/domain';
import { StructuredLogger } from '@bp/shared';
import axios, { AxiosInstance } from 'axios';

/**
 * ACL adapter to the Core (WireMock locally).
 * - postTransfer does NOT retry on failure (avoids double processing): timeout/5xx → UNKNOWN.
 * - Reads use a short timeout.
 */
export class HttpCoreAdapter implements CorePort {
  private readonly http: AxiosInstance;
  private readonly logger = new StructuredLogger('HttpCoreAdapter');

  constructor(baseUrl: string, timeoutMs: number) {
    this.http = axios.create({ baseURL: baseUrl, timeout: timeoutMs, validateStatus: () => true });
  }

  async getAccounts(userId: string): Promise<CoreAccount[]> {
    const res = await this.http.get(`/core/customers/${encodeURIComponent(userId)}/accounts`);
    if (res.status !== 200) throw new Error(`core getAccounts status ${res.status}`);
    return res.data as CoreAccount[];
  }

  async getMovements(accountId: string, cursor: string | null, limit: number): Promise<Paged<CoreMovement>> {
    const res = await this.http.get(`/core/accounts/${encodeURIComponent(accountId)}/movements`, {
      params: { cursor: cursor ?? undefined, limit },
    });
    if (res.status !== 200) throw new Error(`core getMovements status ${res.status}`);
    return res.data as Paged<CoreMovement>;
  }

  async postTransfer(input: CorePostTransferInput): Promise<CoreTransferOutcome> {
    let res;
    try {
      res = await this.http.post(
        `/core/transfers`,
        {
          transferId: input.transferId,
          sourceAccountId: input.sourceAccountId,
          destinationAccountId: input.destinationAccountId,
          amountMinor: input.amountMinor,
          currency: input.currency,
        },
        { headers: { 'Idempotency-Key': input.idempotencyKey } },
      );
    } catch (err) {
      // Timeout / network error: unknown result (do NOT retry blindly).
      this.logger.warn('postTransfer with no response → UNKNOWN', { transferId: input.transferId });
      return { status: 'UNKNOWN' };
    }
    if (res.status === 200 || res.status === 201) {
      return { status: 'CONFIRMED', coreReference: (res.data?.coreReference as string) ?? 'CORE-REF' };
    }
    if (res.status === 422 || res.status === 409) {
      return { status: 'REJECTED', reason: (res.data?.reason as string) ?? 'rejected_by_core' };
    }
    // 5xx or others: unknown.
    return { status: 'UNKNOWN' };
  }

  async getOperationStatus(idempotencyKey: string): Promise<CoreTransferOutcome> {
    const res = await this.http.get(`/core/operations/${encodeURIComponent(idempotencyKey)}`);
    if (res.status === 200) {
      const st = res.data?.status as string;
      if (st === 'CONFIRMED') return { status: 'CONFIRMED', coreReference: (res.data?.coreReference as string) ?? 'CORE-REF' };
      if (st === 'REJECTED') return { status: 'REJECTED', reason: (res.data?.reason as string) ?? 'rejected' };
    }
    return { status: 'UNKNOWN' };
  }
}
