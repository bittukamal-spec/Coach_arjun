import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(() => {
    try { return JSON.parse(localStorage.getItem('mg_user') || 'null'); } catch { return null; }
  });
  // If we already have a cached user, start as not-loading so the app shows immediately
  const [loading, setLoading] = useState(() => !localStorage.getItem('mg_user'));
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
        localStorage.setItem('mg_user', JSON.stringify(data.user));
        const userLang = data.user.language || 'en';
        setLanguage(userLang);
        localStorage.setItem('mg_language', userLang);

        // Silently generate profileIntro for users who completed onboarding but don't have one yet
        if (data.user.onboardingDone && !data.user.profileIntro) {
          apiFetch('/api/profile-intro', {
            headers: { Authorization: `Bearer ${activeToken}` },
          })
            .then(r => r.ok ? r.json() : null)
            .then(introData => {
              if (introData?.intro) {
                const updated = { ...data.user, profileIntro: introData.intro };
                setUser(updated);
                localStorage.setItem('mg_user', JSON.stringify(updated));
              }
            })
            .catch(() => {});
        }
      } else if (res.status === 401 || res.status === 403) {
        // Token genuinely rejected by server — clear everything
        localStorage.removeItem('mg_token');
        localStorage.removeItem('mg_user');
        setToken(null);
        setUser(null);
      }
      // Other server errors or network failures: keep existing user from localStorage
    } catch {
      // Network error (Railway cold start, offline) — keep user from localStorage
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
    localStorage.setItem('mg_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    const lang = newUser.language || 'en';
    setLanguage(lang);
    localStorage.setItem('mg_language', lang);
    setLoading(false);
  }

  function logout() {
    localStorage.removeItem('mg_token');
    localStorage.removeItem('mg_user');
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
    setUser(prev => {
      const updated = { ...prev, ...updatedFields };
      localStorage.setItem('mg_user', JSON.stringify(updated));
      return updated;
    });
    if (updatedFields.language) {
      setLanguage(updatedFields.language);
      localStorage.setItem('mg_language', updatedFields.language);
    }
  }

  return (
    <AuthContext.Provider
      value={{ user, token, loading, language, login, loginWithUser, logout, toggleLanguage, updateUser, fetchUser }}
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
