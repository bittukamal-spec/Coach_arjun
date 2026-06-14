import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import OnboardingPage from './pages/OnboardingPage';
import ChatPage from './pages/ChatPage';
import CheckInPage from './pages/CheckInPage';
import ProgressPage from './pages/ProgressPage';
import ProtectedRoute from './components/ProtectedRoute';
import { translations } from './i18n/translations';

function App() {
  const { loading, language } = useAuth();
  const t = translations[language];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-calm-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">{t.common.loading}</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<LandingPage />} />

      {/* Onboarding — logged in but NOT yet onboarded */}
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute requireOnboarding={false}>
            <OnboardingPage />
          </ProtectedRoute>
        }
      />

      {/* App — logged in AND onboarded */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/coaching"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <ChatPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/checkin"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <CheckInPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/progress"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <ProgressPage />
          </ProtectedRoute>
        }
      />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
