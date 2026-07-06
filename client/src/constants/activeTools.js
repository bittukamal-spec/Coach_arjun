// Canonical list of routes that currently correspond to a real, working
// tool. Before You Play and Bounce Back were retired and must never be
// re-added here. Anything that recommends a tool to an athlete — chat
// cards, MFS recommendations, Dashboard, Train — should resolve to one
// of these routes, or not render a clickable recommendation at all.
export const ACTIVE_TOOL_ROUTES = [
  '/breathing',
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
];

export function isActiveToolRoute(route) {
  return ACTIVE_TOOL_ROUTES.includes(route);
}
