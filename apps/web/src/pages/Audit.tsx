import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { formatDate } from '../format';

interface AuditRow {
  seq?: number;
  action?: string;
  result?: string;
  occurred_at?: string;
  correlation_id?: string;
}

export function Audit() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .audit()
      .then((r) => !cancelled && setRows(r.items as AuditRow[]))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : 'Failed to load activity'));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <div className="state state-error">{error}</div>;
  if (!rows) return <div className="state">Loading…</div>;
  if (rows.length === 0) return <div className="state">No recent activity.</div>;

  return (
    <div>
      <header className="page-head">
        <h1>Recent activity</h1>
        <p className="muted">A simplified view of your recent actions. Sensitive security metadata is not shown.</p>
      </header>
      <table className="table">
        <thead><tr><th>When</th><th>Action</th><th>Result</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.seq ?? i}>
              <td>{r.occurred_at ? formatDate(r.occurred_at) : '—'}</td>
              <td className="mono">{r.action ?? '—'}</td>
              <td><span className={`badge badge-${(r.result ?? '').toLowerCase()}`}>{r.result ?? '—'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
