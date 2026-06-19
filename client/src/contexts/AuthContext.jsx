import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api';

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
      const res = await apiFetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        const userLang = data.user.language || 'en';
        setLanguage(userLang);
        localStorage.setItem('mg_language', userLang);
      } else if (res.status === 401 || res.status === 403) {
        // Token is genuinely invalid — clear it
        logout();
      }
      // Any other server error: keep the token, user stays logged in
    } catch {
      // Network error (Railway cold start, no internet) — don't log out
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

  // Skip the /me round-trip when the server already returned the user object
  function loginWithUser(newToken, newUser) {
    localStorage.setItem('mg_token', newToken);
    setToken(newToken);
    setUser(newUser);
    const lang = newUser.language || 'en';
    setLanguage(lang);
    localStorage.setItem('mg_language', lang);
    setLoading(false);
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
      await apiFetch('/api/auth/me/language', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ language: newLang }),
      }).catch(() => null);
    }
  }

  // Merge a partial update into the current user object.
  // Used by the onboarding page after saving answers.
  function updateUser(updatedFields) {
    setUser(prev => ({ ...prev, ...updatedFields }));
    if (updatedFields.language) {
      setLanguage(updatedFields.language);
      localStorage.setItem('mg_language', updatedFields.language);
    }
  }

  return (
    <AuthContext.Provider
      value={{ user, token, loading, language, login, loginWithUser, logout, toggleLanguage, updateUser }}
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
