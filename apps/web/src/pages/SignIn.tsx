import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export function SignIn() {
  const { authenticated, loading, login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && authenticated) navigate('/', { replace: true });
  }, [authenticated, loading, navigate]);

  return (
    <div className="signin">
      <div className="signin-card">
        <div className="brand brand-lg">BP<span>Bank</span></div>
        <h1>Welcome back</h1>
        <p>Sign in securely with your BP digital-banking credentials.</p>
        <button className="btn-primary" onClick={login} disabled={loading}>
          {loading ? 'Checking session…' : 'Sign in'}
        </button>
        <p className="hint">You will be redirected to the identity provider (OpenID Connect).</p>
      </div>
    </div>
  );
}
