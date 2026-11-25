import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function DashboardPage() {
  const { user, logout } = useAuth();

  const navigate = useNavigate();

  function handleLogout() {
    logout();

    navigate('/login', { replace: true });
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div className="brand">
          <div className="brand-mark">D</div>
          <span>Advanced Dropbox</span>
        </div>

        <button
          className="logout-button"
          onClick={handleLogout}
        >
          Sign out
        </button>
      </header>

      <section className="dashboard-main">
        <div className="welcome-card">
          <p className="eyebrow">
            YOUR WORKSPACE
          </p>

          <h1>
            Welcome, {user?.name || 'User'}!
          </h1>

          <p className="dashboard-description">
            Your account is authenticated and ready.
          </p>

          <div className="user-info">
            <div className="user-avatar">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>

            <div>
              <strong>{user?.name}</strong>
              <p>{user?.email}</p>
            </div>
          </div>
        </div>

        <div className="next-step-card">
          <div className="next-step-icon">📁</div>

          <div>
            <h2>Your file workspace is coming next</h2>

            <p>
              In the next stage, we will connect your account
              to the real file and folder system.
            </p>
          </div>

          <span className="coming-soon">
            STEP 29
          </span>
        </div>
      </section>
    </main>
  );
}