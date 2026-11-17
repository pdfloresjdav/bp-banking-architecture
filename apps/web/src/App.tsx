import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { Layout } from './components/Layout';
import { SignIn } from './pages/SignIn';
import { Dashboard } from './pages/Dashboard';
import { Accounts } from './pages/Accounts';
import { AccountDetail } from './pages/AccountDetail';
import { Transfers } from './pages/Transfers';
import { Audit } from './pages/Audit';
import type { ReactElement } from 'react';

function Protected({ children }: { children: ReactElement }) {
  const { authenticated, loading } = useAuth();
  if (loading) return <div className="centered">Loading…</div>;
  return authenticated ? children : <Navigate to="/sign-in" replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/accounts/:id" element={<AccountDetail />} />
        <Route path="/transfers" element={<Transfers />} />
        <Route path="/audit" element={<Audit />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
