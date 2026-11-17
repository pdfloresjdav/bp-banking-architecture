import { CoreTransferOutcome, CreateTransferRequest, EventEnvelope, Paged, TransferState } from '@bp/contracts';
import {
  AuditPort,
  CoreAccount,
  CoreMovement,
  CorePort,
  CorePostTransferInput,
  CreateTransferOutcome,
  IdempotencyConflictError,
  AccountAuthorizationError,
  ReconciliationCandidate,
  TransferAggregate,
  TransferProps,
  TransferRepositoryPort,
} from '@bp/domain';
import { AccountAuthorizationPort, TransferService } from './transfer.service';

/** In-memory repo emulating INSERT with UNIQUE(idempotency_key) + Outbox within a "transaction". */
class FakeRepo implements TransferRepositoryPort {
  orders = new Map<string, TransferProps>();
  keys = new Map<string, { transferId: string; fingerprint: string }>();
  outbox: EventEnvelope[] = [];

  async createWithIdempotency(input: {
    aggregate: TransferAggregate;
    idempotencyKey: string;
    fingerprint: string;
    event: EventEnvelope;
  }): Promise<CreateTransferOutcome> {
    const existing = this.keys.get(input.idempotencyKey);
    if (existing) {
      return { kind: 'REPLAYED', existing: this.orders.get(existing.transferId)! };
    }
    const snap = input.aggregate.snapshot();
    this.orders.set(snap.transferId, snap);
    this.keys.set(input.idempotencyKey, { transferId: snap.transferId, fingerprint: input.fingerprint });
    this.outbox.push(input.event);
    return { kind: 'CREATED', aggregate: input.aggregate };
  }
  async update(aggregate: TransferAggregate, event?: EventEnvelope): Promise<void> {
    this.orders.set(aggregate.id, aggregate.snapshot());
    if (event) this.outbox.push(event);
  }
  async findById(id: string): Promise<TransferProps | null> {
    return this.orders.get(id) ?? null;
  }
  async findByIdempotencyKey(key: string) {
    return this.keys.get(key) ?? null;
  }
  async findForReconciliation(): Promise<ReconciliationCandidate[]> {
    const out: ReconciliationCandidate[] = [];
    for (const [key, v] of this.keys) {
      const props = this.orders.get(v.transferId)!;
      if (props.state === TransferState.UNKNOWN) out.push({ props, idempotencyKey: key });
    }
    return out;
  }
}

class FakeCore implements CorePort {
  constructor(private outcome: CoreTransferOutcome | 'THROW', private statusOutcome?: CoreTransferOutcome) {}
  postCalls = 0;
  async getAccounts(): Promise<CoreAccount[]> {
    return [];
  }
  async getMovements(): Promise<Paged<CoreMovement>> {
    return { items: [], nextCursor: null, pageSize: 0 };
  }
  async postTransfer(_i: CorePostTransferInput): Promise<CoreTransferOutcome> {
    this.postCalls++;
    if (this.outcome === 'THROW') throw new Error('core timeout');
    return this.outcome;
  }
  async getOperationStatus(): Promise<CoreTransferOutcome> {
    return this.statusOutcome ?? { status: 'UNKNOWN' };
  }
}

class FakeAccounts implements AccountAuthorizationPort {
  constructor(private allowed: boolean) {}
  async canDebit(): Promise<boolean> {
    return this.allowed;
  }
}
class FakeAudit implements AuditPort {
  entries: unknown[] = [];
  async append(e: unknown): Promise<void> {
    this.entries.push(e);
  }
}

const req: CreateTransferRequest = {
  sourceAccountId: 'acc-001',
  destinationAccountId: 'acc-999',
  amount: { amountMinor: 1500, currency: 'USD' },
  kind: 'INTERBANK',
};
const ctx = (idempotencyKey: string) => ({
  userId: 'user-1',
  correlationId: 'corr-1',
  idempotencyKey,
  request: req,
});

describe('TransferService (mandatory scenarios)', () => {
  it('successful transfer → CONFIRMED + requested & confirmed events', async () => {
    const repo = new FakeRepo();
    const svc = new TransferService(repo, new FakeCore({ status: 'CONFIRMED', coreReference: 'CORE-1' }), new FakeAccounts(true), new FakeAudit());
    const res = await svc.create(ctx('key-1'));
    expect(res.state).toBe(TransferState.CONFIRMED);
    expect(res.coreReference).toBe('CORE-1');
    expect(repo.outbox.map((e) => e.name)).toEqual(['bp.transfer.requested.v1', 'bp.transfer.confirmed.v1']);
  });

  it('rejected transfer → REJECTED + failed event', async () => {
    const repo = new FakeRepo();
    const svc = new TransferService(repo, new FakeCore({ status: 'REJECTED', reason: 'balance' }), new FakeAccounts(true), new FakeAudit());
    const res = await svc.create(ctx('key-2'));
    expect(res.state).toBe(TransferState.REJECTED);
    expect(repo.outbox.map((e) => e.name)).toContain('bp.transfer.failed.v1');
  });

  it('Core timeout → UNKNOWN, no re-execution (postTransfer called once)', async () => {
    const repo = new FakeRepo();
    const core = new FakeCore('THROW');
    const svc = new TransferService(repo, core, new FakeAccounts(true), new FakeAudit());
    const res = await svc.create(ctx('key-3'));
    expect(res.state).toBe(TransferState.UNKNOWN);
    expect(core.postCalls).toBe(1);
    expect(repo.outbox.map((e) => e.name)).toContain('bp.transfer.unknown.v1');
  });

  it('replay with the SAME idempotency key does not create a second order', async () => {
    const repo = new FakeRepo();
    const core = new FakeCore({ status: 'CONFIRMED', coreReference: 'CORE-1' });
    const svc = new TransferService(repo, core, new FakeAccounts(true), new FakeAudit());
    const r1 = await svc.create(ctx('key-4'));
    const r2 = await svc.create(ctx('key-4'));
    expect(r2.transferId).toBe(r1.transferId);
    expect(repo.orders.size).toBe(1);
    expect(core.postCalls).toBe(1); // the financial command is not re-executed
  });

  it('same key with different payload → 409 IdempotencyConflictError', async () => {
    const repo = new FakeRepo();
    const svc = new TransferService(repo, new FakeCore({ status: 'CONFIRMED', coreReference: 'X' }), new FakeAccounts(true), new FakeAudit());
    await svc.create(ctx('key-5'));
    await expect(
      svc.create({ ...ctx('key-5'), request: { ...req, amount: { amountMinor: 9999, currency: 'USD' } } }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it('unauthorized source account → 403 AccountAuthorizationError', async () => {
    const repo = new FakeRepo();
    const svc = new TransferService(repo, new FakeCore({ status: 'CONFIRMED', coreReference: 'X' }), new FakeAccounts(false), new FakeAudit());
    await expect(svc.create(ctx('key-6'))).rejects.toBeInstanceOf(AccountAuthorizationError);
    expect(repo.orders.size).toBe(0);
  });

  it('reconciliation resolves UNKNOWN without re-executing the command', async () => {
    const repo = new FakeRepo();
    const core = new FakeCore('THROW', { status: 'CONFIRMED', coreReference: 'CORE-REC' });
    const svc = new TransferService(repo, core, new FakeAccounts(true), new FakeAudit());
    await svc.create(ctx('key-7')); // ends UNKNOWN
    const resolved = await svc.reconcile();
    expect(resolved).toBe(1);
    const order = await svc.getById([...repo.orders.keys()][0]);
    expect(order?.state).toBe(TransferState.CONFIRMED);
    expect(core.postCalls).toBe(1); // postTransfer was never retried
  });
});
