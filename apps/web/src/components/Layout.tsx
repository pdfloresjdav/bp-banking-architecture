import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export function Layout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate('/sign-in', { replace: true });
  };

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand">BP<span>Bank</span></div>
        <nav>
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/accounts">Accounts</NavLink>
          <NavLink to="/transfers">Transfers</NavLink>
          <NavLink to="/audit">Activity</NavLink>
        </nav>
        <button className="btn-logout" onClick={onLogout}>Log out</button>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
