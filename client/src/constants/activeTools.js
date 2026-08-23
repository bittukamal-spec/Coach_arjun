// Canonical list of routes that currently correspond to a real, working
// tool. Before You Play, Bounce Back, and the standalone Breathing tool
// were retired and must never be re-added here — breathing is now part
// of Pressure Reset (/body-reset). The old standalone reflection screen was
// retired the same way in the PR 2 cutover: reflection is the Mind Journal,
// so /mind-journal (and the reflection flow at /mind-journal/new) is what a
// reflection recommendation resolves to. The Mental Playbook was retired as an
// athlete-facing destination too and must never be re-added — /playbook now
// only redirects to Home. Anything that recommends a tool to an
// athlete — chat cards, MFS recommendations, Dashboard, Train — should
// resolve to one of these routes, or not render a clickable recommendation
// at all.
export const ACTIVE_TOOL_ROUTES = [
  '/body-reset',
  '/body-reset/history',
  '/visualization',
  '/mind-journal',
  '/mind-journal/new',
  '/self-talk',
  '/focus-deck',
  '/games/focus-lock',
  '/games/reset-rally',
  '/coaching',
  '/train',
  '/skills/focus-self-talk',
  '/skills/pressure-reset',
  '/mental-rep',
];

export function isActiveToolRoute(route) {
  return ACTIVE_TOOL_ROUTES.includes(route);
}
