import { isActiveToolRoute } from '../constants/activeTools';

// Chat-card config for each [APP:...] tag Arjun's system prompt is allowed
// to emit. Every entry's route must be a real, currently-working tool —
// never a hub page standing in for "something focus-related" (that's how
// the old 'games' → 'Focus Training' → /train card ended up feeling like
// a dead click: it didn't open any specific tool). If a tool is retired,
// delete its entry here; ACTIVE_TOOL_CONFIG below then filters any stale
// tag out automatically instead of rendering a broken card.
const RAW_APP_TOOL_CONFIG = {
  'visualization': {
    label: 'Visualization',
    sub: '4 min mental rep',
    why: 'Mentally rehearse the moment before it happens.',
    cta: 'Rehearse it',
    icon: 'Eye',
    iconColor: '#6366F1',
    bgColor: '#EEF2FF',
    route: '/visualization',
  },
  'breathing': {
    label: 'Breathe',
    sub: '2 min reset',
    why: 'Slows the body down so your mind can follow.',
    cta: 'Start breathing',
    icon: 'Wind',
    iconColor: '#2E7D6B',
    bgColor: '#F0FAF7',
    route: '/breathing',
  },
  'body-reset': {
    label: 'Body Reset',
    sub: '3 min reset',
    why: 'Helps when pressure makes your body rush.',
    cta: 'Reset body',
    icon: 'RotateCcw',
    iconColor: '#2E7D6B',
    bgColor: '#F0FAF7',
    route: '/body-reset',
  },
  'after-the-match': {
    label: 'After Match / Training',
    sub: '3 min reflect',
    why: 'Turns today\'s session into one clear takeaway.',
    cta: 'Reflect now',
    icon: 'ClipboardList',
    iconColor: '#1E3A5F',
    bgColor: '#EFF6FF',
    route: '/debrief',
  },
  'self-talk': {
    label: 'Self-Talk Builder',
    sub: 'Build one cue for your next training session.',
    why: 'Helps you bring your mind back to one action.',
    cta: 'Build cue',
    icon: 'MessageSquare',
    iconColor: '#185FA5',
    bgColor: '#EBF3FC',
    route: '/self-talk',
  },
  'focus-lock': {
    label: 'Focus Lock',
    sub: '60-second focus rep.',
    why: 'Practise returning to your cue under distraction.',
    cta: 'Train focus',
    icon: 'Target',
    iconColor: '#185FA5',
    bgColor: '#EBF3FC',
    route: '/games/focus-lock',
  },
  'reset-rally': {
    label: 'Reset Rally',
    sub: '60-second rep',
    why: 'Practise the next-action reset after a mistake.',
    cta: 'Practise reset',
    icon: 'RefreshCw',
    iconColor: '#185FA5',
    bgColor: '#EBF3FC',
    route: '/games/reset-rally',
  },
  'focus-deck': {
    label: 'Focus Cards',
    sub: 'Your saved cues',
    why: 'Review the cue words and phrases you already built.',
    cta: 'View cards',
    icon: 'Layers',
    iconColor: '#185FA5',
    bgColor: '#EBF3FC',
    route: '/focus-deck',
  },
  'train': {
    label: 'Train',
    sub: 'Your mental training toolkit',
    why: 'Find the right tool for what you need right now.',
    cta: 'Open Train',
    icon: 'Dumbbell',
    iconColor: '#185FA5',
    bgColor: '#EBF3FC',
    route: '/train',
  },
  'skill-focus-self-talk': {
    label: 'Focus / Self-Talk',
    sub: 'Learn how to bring your mind back to one cue.',
    why: 'A short path to build and practise your own focus cue.',
    cta: 'Learn focus',
    icon: 'GraduationCap',
    iconColor: '#185FA5',
    bgColor: '#EBF3FC',
    route: '/skills/focus-self-talk',
  },
};

// Guardrail: drop any entry whose route isn't in the active-tool registry,
// so a future stale/mistyped route can never render a clickable card —
// it just won't be recognised as a valid tool id.
export const APP_TOOL_CONFIG = Object.fromEntries(
  Object.entries(RAW_APP_TOOL_CONFIG).filter(([id, config]) => {
    if (!isActiveToolRoute(config.route)) {
      console.warn(`[parseArjunMessage] Dropping tool "${id}" — route "${config.route}" is not in ACTIVE_TOOL_ROUTES`);
      return false;
    }
    return true;
  })
);

export function parseArjunMessage(text) {
  const tools = [];
  const cleanText = text
    .replace(/\[APP:([a-z-]+)\]/g, (_, id) => {
      if (tools.length < 2) tools.push(id);
      return '';
    })
    .trimEnd();
  return { cleanText, tools };
}
