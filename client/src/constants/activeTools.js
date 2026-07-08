// Canonical list of routes that currently correspond to a real, working
// tool. Before You Play, Bounce Back, and the standalone Breathing tool
// were retired and must never be re-added here — breathing is now part
// of Pressure Reset (/body-reset). Anything that recommends a tool to an
// athlete — chat cards, MFS recommendations, Dashboard, Train — should
// resolve to one of these routes, or not render a clickable recommendation
// at all.
export const ACTIVE_TOOL_ROUTES = [
  '/body-reset',
  '/body-reset/history',
  '/visualization',
  '/debrief',
  '/self-talk',
  '/focus-deck',
  '/games/focus-lock',
  '/games/reset-rally',
  '/coaching',
  '/train',
  '/skills/focus-self-talk',
  '/skills/pressure-reset',
  '/mental-rep',
  '/playbook',
];

export function isActiveToolRoute(route) {
  return ACTIVE_TOOL_ROUTES.includes(route);
}
