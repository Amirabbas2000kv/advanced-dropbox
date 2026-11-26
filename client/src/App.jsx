import { Link, Navigate, Route, Routes } from 'react-router-dom';

import { useAuth } from './context/AuthContext';

import {
  ProtectedRoute,
  PublicOnlyRoute,
  LoadingScreen,
} from './components/RouteGuards';

import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import TrashPage from './pages/TrashPage';

function HomeRedirect() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <Navigate
      to={isAuthenticated ? '/dashboard' : '/login'}
      replace
    />
  );
}

// Dashboard with a shortcut to the Trash page.
function DashboardWithTrashShortcut() {
  return (
    <>
      <DashboardPage />

      <Link
        to="/trash"
        aria-label="Open Trash"
        style={{
          position: 'fixed',
          right: '24px',
          bottom: '24px',
          zIndex: 900,
          display: 'flex',
          alignItems: 'center',
          gap: '9px',
          padding: '13px 19px',
          border: '1px solid #bfdbfe',
          borderRadius: '30px',
          background: '#ffffff',
          color: '#1d4ed8',
          boxShadow: '0 5px 20px rgba(20, 35, 70, 0.13)',
          fontSize: '13px',
          fontWeight: 750,
          textDecoration: 'none',
        }}
      >
        <span aria-hidden="true">🗑️</span>
        Trash
      </Link>
    </>
  );
}

export default function App() {
  return (
    <Routes>

      <Route
        path="/"
        element={<HomeRedirect />}
      />

      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />

      <Route
        path="/register"
        element={
          <PublicOnlyRoute>
            <RegisterPage />
          </PublicOnlyRoute>
        }
      />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardWithTrashShortcut />
          </ProtectedRoute>
        }
      />

      <Route
        path="/trash"
        element={
          <ProtectedRoute>
            <TrashPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="*"
        element={<Navigate to="/" replace />}
      />

    </Routes>
  );
}