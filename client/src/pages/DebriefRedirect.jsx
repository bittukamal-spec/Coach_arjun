import { Navigate, useLocation } from 'react-router-dom';

// Compatibility route for /debrief (PR 2 cutover).
//
// The old Match & Practice Reflection screen is retired as an athlete entry
// point — the Mind Journal reflection is now the only place an athlete
// writes a reflection. Old bookmarks, deep links, and any link written
// before the cutover must still land somewhere sensible rather than 404,
// so this route redirects instead of rendering the retired screen.
//
// Two destinations, and never anything else:
//   - launched from a prescribed post_performance_reflection card → the
//     reflection flow itself, carrying the exact prescriptionId +
//     practiceKey forward so the prescription can still be completed by the
//     existing linkage mechanism.
//   - anything else → the Mind Journal home.
//
// Neither destination redirects back here, so there is no loop. Nothing
// server-side changes: historical Debrief rows, /api/debrief and the Prisma
// Debrief model are untouched and stay readable.

const REFLECTION_PRACTICE_KEY = 'post_performance_reflection';

// The prescription link may arrive as ephemeral router state (how the app
// itself passes it) or as query params (how an external deep link would
// have to). Both resolve to the same forwarded route state — the shape the
// reflection flow already reads.
export function resolveDebriefRedirect(locationState, search) {
  const params = new URLSearchParams(search || '');
  const prescriptionId = locationState?.prescriptionId || params.get('prescriptionId') || null;
  const practiceKey = locationState?.practiceKey || params.get('practiceKey') || null;

  if (prescriptionId && practiceKey === REFLECTION_PRACTICE_KEY) {
    return { to: '/mind-journal/new', state: { prescriptionId, practiceKey } };
  }
  return { to: '/mind-journal', state: null };
}

export default function DebriefRedirect() {
  const location = useLocation();
  const { to, state } = resolveDebriefRedirect(location.state, location.search);
  return <Navigate to={to} state={state ?? undefined} replace />;
}
