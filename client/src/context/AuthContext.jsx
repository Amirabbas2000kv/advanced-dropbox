import {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';

import {
  apiRequest,
  getStoredToken,
  saveToken,
  clearToken,
} from '../api/http';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  const [token, setToken] = useState(() => getStoredToken());

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    function handleUnauthorized() {
      clearToken();
      setToken(null);
      setUser(null);
    }

    window.addEventListener(
      'auth:unauthorized',
      handleUnauthorized
    );

    async function restoreSession() {
      const storedToken = getStoredToken();

      if (!storedToken) {
        setLoading(false);
        return;
      }

      try {
        const data = await apiRequest('/auth/me');

        if (!cancelled) {
          setUser(data.user || null);
        }
      } catch (error) {
        if (error.status !== 401) {
          console.error('Session restoration failed:', error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      cancelled = true;

      window.removeEventListener(
        'auth:unauthorized',
        handleUnauthorized
      );
    };
  }, []);

  async function login(credentials) {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      auth: false,
      body: JSON.stringify(credentials),
    });

    if (!data.token || !data.user) {
      throw new Error('Invalid login response from server');
    }

    saveToken(data.token);

    setToken(data.token);
    setUser(data.user);

    return data.user;
  }

  async function register(userData) {
    return apiRequest('/auth/register', {
      method: 'POST',
      auth: false,
      body: JSON.stringify(userData),
    });
  }

  function logout() {
    clearToken();

    setToken(null);
    setUser(null);
  }

  const value = {
    user,
    token,
    loading,
    isAuthenticated: Boolean(user && token),
    login,
    register,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      'useAuth must be used inside AuthProvider'
    );
  }

  return context;
}