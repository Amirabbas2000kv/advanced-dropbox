import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function LoadingScreen() {
  return (
    <main className="loading-page">
      <div className="loading-spinner"></div>
      <p>Checking your session...</p>
    </main>
  );
}

export function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export function PublicOnlyRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}