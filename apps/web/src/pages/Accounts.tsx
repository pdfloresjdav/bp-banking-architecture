import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type Account } from '../api';
import { formatMoney } from '../format';

export function Accounts() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .accounts()
      .then((r) => !cancelled && setAccounts(r.items))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : 'Failed to load accounts'));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <div className="state state-error">{error}</div>;
  if (!accounts) return <div className="state">Loading…</div>;
  if (accounts.length === 0) return <div className="state">You have no accounts yet.</div>;

  return (
    <div>
      <header className="page-head"><h1>Accounts</h1></header>
      <table className="table">
        <thead>
          <tr><th>Product</th><th>Account</th><th>Currency</th><th className="num">Balance</th><th></th></tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={a.accountId}>
              <td>{a.product}</td>
              <td className="mono">{a.accountId}</td>
              <td>{a.currency}</td>
              <td className="num">{formatMoney(a.balanceMinor, a.currency)}</td>
              <td><Link to={`/accounts/${a.accountId}`}>View</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
