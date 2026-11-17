import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type Account, type TransferResponse } from '../api';
import { useAuth } from '../auth';
import { formatMoney } from '../format';

export function Transfers() {
  const { csrf } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<'OWN' | 'INTERBANK'>('INTERBANK');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<TransferResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Idempotency key is stable per form content → re-submitting the same transfer is safe (no duplicate).
  const idemKey = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    api.accounts().then((r) => {
      setAccounts(r.items);
      setSource(r.items[0]?.accountId ?? '');
    }).catch(() => setError('Failed to load accounts'));
  }, []);

  // Reset idempotency key when the user changes the transfer details.
  useEffect(() => {
    idemKey.current = crypto.randomUUID();
  }, [source, destination, amount, kind]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return; // duplicate-submission protection
    setError(null);
    setResult(null);
    const minor = Math.round(parseFloat(amount) * 100);
    if (!Number.isFinite(minor) || minor <= 0) {
      setError('Enter a valid amount greater than zero.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.createTransfer(idemKey.current, csrf ?? '', {
        sourceAccountId: source,
        destinationAccountId: destination,
        amount: { amountMinor: minor, currency: accounts.find((a) => a.accountId === source)?.currency ?? 'USD' },
        kind,
      });
      setResult(res);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && e.body.code?.includes('step')) {
        setError('Step-up authentication is required for this transfer. Please re-authenticate with a second factor.');
      } else if (e instanceof ApiError && e.status === 409) {
        setError('This transfer was already submitted with different details. Review and try again.');
      } else {
        setError(e instanceof ApiError ? e.message : 'Transfer failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <header className="page-head"><h1>New transfer</h1></header>

      <form className="form" onSubmit={onSubmit}>
        <label>
          Source account
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.accountId} value={a.accountId}>{a.product} · {a.accountId} · {formatMoney(a.balanceMinor, a.currency)}</option>
            ))}
          </select>
        </label>
        <label>
          Beneficiary account
          <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. acc-999" required />
        </label>
        <label>
          Amount
          <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
        </label>
        <label>
          Type
          <select value={kind} onChange={(e) => setKind(e.target.value as 'OWN' | 'INTERBANK')}>
            <option value="INTERBANK">Interbank</option>
            <option value="OWN">Between my accounts</option>
          </select>
        </label>
        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Confirm transfer'}
        </button>
      </form>

      {error && <div className="state state-error">{error}</div>}

      {result && (
        <div className={`result result-${result.state.toLowerCase()}`}>
          <h2>Transfer {result.state}</h2>
          <p>Reference: <span className="mono">{result.transferId}</span></p>
          {result.coreReference && <p>Core reference: <span className="mono">{result.coreReference}</span></p>}
          {result.state === 'UNKNOWN' && (
            <p className="muted">The result is being verified with the bank. We will update the status shortly — this does not mean the transfer was completed.</p>
          )}
          {result.state === 'REJECTED' && <p className="muted">The transfer was rejected by the bank.</p>}
          {result.state === 'CONFIRMED' && <p className="muted">The transfer was confirmed by the bank.</p>}
        </div>
      )}
    </div>
  );
}
