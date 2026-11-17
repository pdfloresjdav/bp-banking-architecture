import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type Account } from '../api';
import { formatMoney } from '../format';

export function Dashboard() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [profile, setProfile] = useState<{ userId: string; accountsCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [me, acc] = await Promise.all([api.me(), api.accounts()]);
        if (!cancelled) {
          setProfile({ userId: me.userId, accountsCount: me.accountsCount });
          setAccounts(acc.items);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : 'Failed to load dashboard');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <div className="state state-error">{error}</div>;
  if (!accounts || !profile) return <div className="state">Loading…</div>;

  const total = accounts.reduce((s, a) => s + a.balanceMinor, 0);
  const currency = accounts[0]?.currency ?? 'USD';

  return (
    <div>
      <header className="page-head">
        <h1>Welcome, {profile.userId}</h1>
        <p>You have {profile.accountsCount} account(s).</p>
      </header>

      <section className="cards">
        <div className="card kpi">
          <span className="kpi-label">Total balance</span>
          <span className="kpi-value">{formatMoney(total, currency)}</span>
        </div>
        {accounts.map((a) => (
          <Link key={a.accountId} to={`/accounts/${a.accountId}`} className="card account-card">
            <span className="account-product">{a.product}</span>
            <span className="account-id">{a.accountId}</span>
            <span className="account-balance">{formatMoney(a.balanceMinor, a.currency)}</span>
          </Link>
        ))}
      </section>

      <div className="actions">
        <Link to="/transfers" className="btn-primary">New transfer</Link>
      </div>
    </div>
  );
}
