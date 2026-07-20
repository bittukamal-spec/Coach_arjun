import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { useTheme } from './hooks/useTheme';
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import RefundPage from './pages/RefundPage';
import Dashboard from './pages/Dashboard';
import OnboardingPage from './pages/OnboardingPage';
import ChatPage from './pages/ChatPage';
import AccountPage from './pages/AccountPage';
import RitualPage from './pages/RitualPage';
import MentalGameProfilePage from './pages/MentalGameProfilePage';
import TrainPage from './pages/TrainPage';
import DebriefPage from './pages/DebriefPage';
import FocusLockGame from './pages/games/FocusLockGame';
import ResetRallyGame from './pages/games/ResetRallyGame';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import GuardianConsentPage from './pages/GuardianConsentPage';
import PricingPage from './pages/PricingPage';
import PaymentSuccessPage from './pages/PaymentSuccessPage';
import MindJournalPage from './pages/MindJournalPage';
import VisualizationPage from './pages/VisualizationPage';
import SelfTalkPage from './pages/SelfTalkPage';
import FocusSelfTalkSkillPath from './pages/skills/FocusSelfTalkSkillPath';
import PressureResetSkillPath from './pages/skills/PressureResetSkillPath';
import FocusDeckPage from './pages/FocusDeckPage';
import BodyResetPage from './pages/BodyResetPage';
import ResetHistoryPage from './pages/ResetHistoryPage';
import MentalRepPage from './pages/MentalRepPage';
import PlaybookPage from './pages/PlaybookPage';
import WeeklyReviewsPage from './pages/WeeklyReviewsPage';
import ProtectedRoute from './components/ProtectedRoute';
import BottomNav from './components/BottomNav';
import { translations } from './i18n/translations';

function App() {
  const { loading, language, user } = useAuth();
  const t = translations[language];
  useTheme(); // initializes data-theme on <html> from localStorage

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
      <Route path="/guardian-consent" element={<GuardianConsentPage />} />

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
      {/* Progress is no longer a primary athlete-facing destination — the
          Mental Playbook replaces it in navigation. ProgressPage.jsx and
          its backend endpoints are untouched; only this route entry
          changed, so direct links/bookmarks still land somewhere useful. */}
      <Route path="/progress" element={<Navigate to="/playbook" replace />} />
      <Route
        path="/account"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <AccountPage />
            <BottomNav />
          </ProtectedRoute>
        }
      />

      {/* Before You Play + Bounce Back removed — retired for MVP, redirect to Train */}
      <Route path="/bounce-back" element={<Navigate to="/train" replace />} />
      <Route path="/before-you-play" element={<Navigate to="/train" replace />} />
      {/* Standalone Breathing tool folded into Pressure Reset (Body Reset) — redirect to keep old links/bookmarks alive */}
      <Route path="/breathing" element={<Navigate to="/body-reset" replace />} />
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
          </ProtectedRoute>
        }
      />
      {/* Games hub folded into Train — redirect to keep old links/bookmarks alive */}
      <Route path="/games" element={<Navigate to="/train" replace />} />
      {/* Mental Reps games — full screen, no BottomNav */}
      <Route
        path="/games/focus-lock"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <FocusLockGame />
          </ProtectedRoute>
        }
      />
      <Route
        path="/games/reset-rally"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <ResetRallyGame />
          </ProtectedRoute>
        }
      />
      {/* Mind Journal — score-free, replaces the old scored Mental Fitness
          check-in. Full screen, no BottomNav. */}
      <Route
        path="/mind-journal"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <MindJournalPage />
          </ProtectedRoute>
        }
      />
      {/* Old bookmarked Mental Fitness link — redirect to the new score-free
          experience for compatibility. The legacy server endpoint and data
          are untouched; this route just stops opening the old scored UI. */}
      <Route path="/mental-fitness" element={<Navigate to="/mind-journal" replace />} />

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

      <Route
        path="/visualization"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <VisualizationPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/self-talk"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <SelfTalkPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/skills/focus-self-talk"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <FocusSelfTalkSkillPath />
          </ProtectedRoute>
        }
      />

      <Route
        path="/skills/pressure-reset"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <PressureResetSkillPath />
          </ProtectedRoute>
        }
      />

      {/* Daily Mental Rep — full screen, no BottomNav */}
      <Route
        path="/mental-rep"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <MentalRepPage />
          </ProtectedRoute>
        }
      />

      {/* Weekly Reviews — weekly coaching summaries, outside the live chat
          stream. Reached from the Chat header; back goes to Coach. */}
      <Route
        path="/weekly-reviews"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <WeeklyReviewsPage />
            <BottomNav />
          </ProtectedRoute>
        }
      />

      {/* Mental Playbook — private library, with BottomNav */}
      <Route
        path="/playbook"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <PlaybookPage />
            <BottomNav />
          </ProtectedRoute>
        }
      />

      <Route
        path="/focus-deck"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <FocusDeckPage />
            <BottomNav />
          </ProtectedRoute>
        }
      />

      <Route
        path="/body-reset"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <BodyResetPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/body-reset/history"
        element={
          <ProtectedRoute requireOnboarding={true}>
            <ResetHistoryPage />
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
