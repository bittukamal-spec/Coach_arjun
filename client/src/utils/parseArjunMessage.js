export const APP_TOOL_CONFIG = {
  'bounce-back': {
    label: 'Bounce Back',
    sub: '3 min reset',
    icon: 'Zap',
    iconColor: '#D98B2B',
    bgColor: '#FEF9F0',
    route: '/bounce-back',
  },
  'before-you-play': {
    label: 'Before You Play',
    sub: '5 min prep',
    icon: 'PlayCircle',
    iconColor: '#185FA5',
    bgColor: '#EBF3FC',
    route: '/before-you-play',
  },
  'visualization': {
    label: 'Visualization',
    sub: '4 min mental rep',
    icon: 'Eye',
    iconColor: '#6366F1',
    bgColor: '#EEF2FF',
    route: '/visualization',
  },
  'breathing': {
    label: 'Breathe',
    sub: '2 min reset',
    icon: 'Wind',
    iconColor: '#2E7D6B',
    bgColor: '#F0FAF7',
    route: '/breathing',
  },
  'after-the-match': {
    label: 'After the Match',
    sub: '3 min reflect',
    icon: 'ClipboardList',
    iconColor: '#1E3A5F',
    bgColor: '#EFF6FF',
    route: '/debrief',
  },
  'games': {
    label: 'Focus Training',
    sub: 'Sharpen attention',
    icon: 'Target',
    iconColor: '#185FA5',
    bgColor: '#EBF3FC',
    route: '/games',
  },
};

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
