import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken]     = useState(() => localStorage.getItem('mg_token'));
  const [language, setLanguage] = useState(
    () => localStorage.getItem('mg_language') || 'en'
  );

  const fetchUser = useCallback(async (activeToken) => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        // Sync language from the user's saved preference
        const userLang = data.user.language || 'en';
        setLanguage(userLang);
        localStorage.setItem('mg_language', userLang);
      } else {
        logout();
      }
    } catch {
      logout();
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (token) {
      fetchUser(token);
    } else {
      setLoading(false);
    }
  }, [token, fetchUser]);

  function login(newToken) {
    localStorage.setItem('mg_token', newToken);
    setToken(newToken);
  }

  function logout() {
    localStorage.removeItem('mg_token');
    setToken(null);
    setUser(null);
    setLoading(false);
  }

  async function toggleLanguage() {
    const newLang = language === 'en' ? 'hi' : 'en';
    setLanguage(newLang);
    localStorage.setItem('mg_language', newLang);

    // Persist preference to the server if the user is logged in
    if (token) {
      await fetch('/api/auth/me/language', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ language: newLang }),
      }).catch(() => null);
    }
  }

  return (
    <AuthContext.Provider
      value={{ user, token, loading, language, login, logout, toggleLanguage }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
