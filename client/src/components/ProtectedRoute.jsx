import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// requireOnboarding (default true):
//   if true  → also redirects to /onboarding when the user hasn't finished it yet
//   if false → just checks authentication (used for the onboarding page itself)
function ProtectedRoute({ children, requireOnboarding = true }) {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/" replace />;
  if (requireOnboarding && !user.onboardingDone) return <Navigate to="/onboarding" replace />;

  return children;
}

export default ProtectedRoute;
