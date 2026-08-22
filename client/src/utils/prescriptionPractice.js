// Client-side mapping of approved Mental Rep practice keys (server
// src/services/coaching/practiceRegistry.js) to a real, reachable
// completion flow (PR-12).
//
// Only these two currently have a genuine existing completion point the
// athlete can be routed to directly and reach a real "I finished this"
// action:
//   - pressure_reset            -> /body-reset  (BodyResetPage saveSession())
//   - post_performance_reflection -> /mind-journal/new  (ReflectionWizard
//     handleSave()) — repointed in the PR 2 cutover. The practice key, the
//     prescriptionId carried in route state, and the completion endpoint are
//     all unchanged; only the surface the athlete lands on moved.
//
// Every other approved practice key intentionally has NO entry here yet —
// not because it's unimportant, but because there is no real integration
// point to link to without inventing one:
//   - focus_cue_building        -> /self-talk is a card-GENERATION wizard;
//     its "practice" step re-engages an already-saved Focus Deck card
//     reached via a different flow, not a fresh prescribed-practice launch.
//   - attentional_routine, mistake_reset_routine -> "chat-coached", no
//     dedicated page exists.
//   - pre_performance_routine, guided_rehearsal -> reference a "prep-flow"
//     surface that does not exist as a client route.
//   - acclimatization_homework  -> real-world homework, no app surface at all.
// A prescribed card for any of these renders exactly as it does today (text
// + cue word, no launch link) until a later PR builds a real completion
// point for it.
const PRESCRIBED_PRACTICE_ROUTES = {
  pressure_reset: '/body-reset',
  post_performance_reflection: '/mind-journal/new',
};

export function practiceRouteFor(practiceKey) {
  return PRESCRIBED_PRACTICE_ROUTES[practiceKey] || null;
}
