import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError, type Movement } from '../api';
import { formatDate, formatMoney } from '../format';

export function AccountDetail() {
  const { id = '' } = useParams();
  const [movements, setMovements] = useState<Movement[] | null>(null);
  const [cache, setCache] = useState<string | undefined>();
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(nextCursor?: string) {
    setError(null);
    try {
      const r = await api.movements(id, nextCursor);
      setMovements((prev) => (nextCursor && prev ? [...prev, ...r.items] : r.items));
      setCursor(r.nextCursor);
      setCache(r._cache);
    } catch (e) {
      setError(e instanceof ApiError ? (e.status === 403 ? 'You are not authorized to view this account.' : e.message) : 'Failed to load movements');
    }
  }

  useEffect(() => {
    setMovements(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div>
      <header className="page-head">
        <h1>Account {id}</h1>
        <Link to="/accounts">← Back to accounts</Link>
      </header>

      {error && <div className="state state-error">{error}</div>}
      {!error && !movements && <div className="state">Loading movements…</div>}
      {!error && movements && movements.length === 0 && <div className="state">No transactions found.</div>}

      {movements && movements.length > 0 && (
        <>
          {cache && <p className="muted">Data source: {cache === 'HIT' ? 'cache' : 'Core'}</p>}
          <table className="table">
            <thead><tr><th>Date</th><th>Description</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.movementId}>
                  <td>{formatDate(m.date)}</td>
                  <td>{m.description}</td>
                  <td className={`num ${m.amountMinor < 0 ? 'neg' : 'pos'}`}>{formatMoney(m.amountMinor, m.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {cursor && <button className="btn-secondary" onClick={() => void load(cursor)}>Load more</button>}
        </>
      )}
    </div>
  );
}
