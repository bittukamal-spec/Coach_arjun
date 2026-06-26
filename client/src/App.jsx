import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import RefundPage from './pages/RefundPage';
import Dashboard from './pages/Dashboard';
import OnboardingPage from './pages/OnboardingPage';
import ChatPage from './pages/ChatPage';
import CheckInPage from './pages/CheckInPage';
import ProgressPage from './pages/ProgressPage';
import AccountPage from './pages/AccountPage';
import BreathingPage from './pages/BreathingPage';
import RitualPage from './pages/RitualPage';
import MentalGameProfilePage from './pages/MentalGameProfilePage';
import TrainPage from './pages/TrainPage';
import DebriefPage from './pages/DebriefPage';
import GamesPage from './pages/GamesPage';
import PersonalityTestPage from './pages/PersonalityTestPage';
import PressureResetPage from './pages/PressureResetPage';
import BounceBackPage from './pages/BounceBackPage';
import SessionsPage from './pages/SessionsPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import PricingPage from './pages/PricingPage';
import PaymentSuccessPage from './pages/PaymentSuccessPage';
import MentalFitnessCheckin from './pages/MentalFitnessCheckin';
import ProtectedRoute from './components/ProtectedRoute';
import BottomNav from './components/BottomNav';
import { translations } from './i18n/translations';

function App() {
  const { loading, language, user } = useAuth();
  const t = translations[language];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-900">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slt text-sm">{t.common.loading}</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
      <Route path="/auth" element={user ? <Navigate to="/dashboard" replace /> : <AuthPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/refund" element={<RefundPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Onboarding — logged in but NOT yet onboarded */}
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute requireOnboarding={false}>
            <OnboardingPage />
          </ProtectedRoute>
        }
      />

      {/* Mental Game Profile — logged in AND onboarded, shown once after onboarding */}
      <Route
        path="/mental-game-profile"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <MentalGameProfilePage />
          </ProtectedRoute>
        }
      />

      {/* App — logged in AND onboarded — include BottomNav */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <Dashboard />
            <BottomNav />
          </ProtectedRoute>
        }
      />
      <Route
        path="/coaching"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <ChatPage />
            <BottomNav />
          </ProtectedRoute>
        }
      />
      <Route path="/checkin" element={<Navigate to="/mental-fitness" replace />} />
      <Route
        path="/progress"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <ProgressPage />
            <BottomNav />
          </ProtectedRoute>
        }
      />
      <Route
        path="/account"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <AccountPage />
            <BottomNav />
          </ProtectedRoute>
        }
      />

      <Route
        path="/breathing"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <BreathingPage />
            <BottomNav />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sessions"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <SessionsPage />
            <BottomNav />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reset"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <PressureResetPage />
            <BottomNav />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bounce-back"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <BounceBackPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ritual"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <RitualPage />
            <BottomNav />
          </ProtectedRoute>
        }
      />
      <Route
        path="/debrief"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <DebriefPage />
            <BottomNav />
          </ProtectedRoute>
        }
      />
      <Route
        path="/games"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <GamesPage />
            <BottomNav />
          </ProtectedRoute>
        }
      />
      <Route
        path="/personality-test"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <PersonalityTestPage />
          </ProtectedRoute>
        }
      />

      {/* Mental Fitness check-in — full screen, no BottomNav */}
      <Route
        path="/mental-fitness"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <MentalFitnessCheckin />
          </ProtectedRoute>
        }
      />

      {/* Payment flows — no BottomNav */}
      <Route
        path="/pricing"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <PricingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/payment-success"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <PaymentSuccessPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/train"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <TrainPage />
            <BottomNav />
          </ProtectedRoute>
        }
      />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
