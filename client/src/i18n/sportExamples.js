// Sport-specific examples (founder, Nov 2026): every example an athlete sees
// — tool example cards, the Home Mind Journal line, Coach's empty-chat
// openers — uses their own sport. One block per onboarding sport, plus
// `generic` for "Other" or no sport. English only (Hindi UI is off).
//
// Each block: event (what a competition is called), mistake (a common slip),
// worry (the thought after it), focusWord, resetWord, strongLine,
// moment (a big moment), watch (one thing to look at), routine {title, steps},
// helped (what calmed them), chat (things they might say to Arjun).

const SPORTS = {
  cricket: {
    event: 'match', mistake: 'Dropped an easy catch', worry: 'Everyone saw that.',
    focusWord: 'Watch the ball', resetWord: 'Next ball', strongLine: 'I have caught a hundred of these.',
    moment: 'Your first over', watch: 'The bowler’s hand',
    routine: { title: 'Before I bat', steps: ['Two slow breaths', 'Tap the bat twice', 'Look at the sightscreen', 'Say “Watch it”'] },
    helped: 'One slow breath out, then focus on the next ball',
    chat: ['I get nervous before I bat', 'I can’t forget a dropped catch', 'My hands shake in the first over', 'I’m scared of getting out early', 'Selection trials are next week'],
  },
  football: {
    event: 'match', mistake: 'Missed an open goal', worry: 'The coach will drop me.',
    focusWord: 'Next action', resetWord: 'Go again', strongLine: 'I find space. I get the next one.',
    moment: 'Your first touch of the game', watch: 'The space in front of you',
    routine: { title: 'Before kick-off', steps: ['Two slow breaths', 'Bounce on your toes', 'Look at the far goal', 'Say “First touch”'] },
    helped: 'Clapped once and sprinted back into position',
    chat: ['I hide from the ball after a mistake', 'I get nervous before penalties', 'My coach shouts and I freeze', 'I play badly in big matches', 'Trials for the district team are coming'],
  },
  badminton: {
    event: 'match', mistake: 'Lost five points in a row', worry: 'I’m going to lose this game.',
    focusWord: 'Watch the shuttle', resetWord: 'Next point', strongLine: 'One rally at a time. I move well.',
    moment: 'Serving at game point', watch: 'The shuttle’s cork',
    routine: { title: 'Before I serve', steps: ['One slow breath out', 'Bounce the racket strings', 'Look at the spot you aim for', 'Say “Smooth”'] },
    helped: 'Fixed my strings, took one breath, then played the next point',
    chat: ['I lose close games at the end', 'My serve goes wrong under pressure', 'I get angry after silly errors', 'I can’t focus after losing a game', 'I have a tournament this weekend'],
  },
  athletics: {
    event: 'race', mistake: 'Got a slow start', worry: 'The race is already gone.',
    focusWord: 'Drive', resetWord: 'Stay tall', strongLine: 'I have trained for this. My legs know the way.',
    moment: 'On the start line', watch: 'Your lane, a few metres ahead',
    routine: { title: 'Before my race', steps: ['Two slow breaths', 'Shake out your arms', 'Look down your lane', 'Say “Drive”'] },
    helped: 'Breathed out slowly on the line and only thought about my start',
    chat: ['My legs feel heavy before races', 'I think about other runners too much', 'I false start when I’m nervous', 'I panic in the last 100 metres', 'Nationals are next month'],
  },
  wrestling: {
    event: 'bout', mistake: 'Got taken down early', worry: 'He’s too strong for me.',
    focusWord: 'Low and strong', resetWord: 'Reset stance', strongLine: 'I have trained harder. I keep pushing.',
    moment: 'The first grip', watch: 'Your opponent’s hips',
    routine: { title: 'Before my bout', steps: ['Two slow breaths', 'Slap your legs twice', 'Look at the centre circle', 'Say “Low and strong”'] },
    helped: 'Breathed out, reset my stance and went for the next grip',
    chat: ['I freeze against bigger opponents', 'Making weight makes me anxious', 'I give up after being taken down', 'I get nervous when my family watches', 'State trials are coming up'],
  },
  boxing: {
    event: 'bout', mistake: 'Got caught with a clean punch', worry: 'I’m losing this round.',
    focusWord: 'Hands up', resetWord: 'Breathe, move', strongLine: 'I stay calm. I stick to my plan.',
    moment: 'The first bell', watch: 'Your opponent’s chest',
    routine: { title: 'Before the bell', steps: ['Two slow breaths', 'Touch your gloves together', 'Look at your corner', 'Say “Hands up”'] },
    helped: 'Moved away, breathed out and went back to my jab',
    chat: ['I panic after getting hit', 'I can’t sleep before a fight', 'I forget my plan in the ring', 'I get tired fast because of nerves', 'My first tournament is next week'],
  },
  kabaddi: {
    event: 'match', mistake: 'Got tackled on a raid', worry: 'I let the team down.',
    focusWord: 'Quick feet', resetWord: 'Next raid', strongLine: 'I am quick. I find the gap.',
    moment: 'Your first raid', watch: 'The defenders’ feet',
    routine: { title: 'Before I raid', steps: ['One slow breath', 'Clap twice', 'Look at the baulk line', 'Say “Quick feet”'] },
    helped: 'Took a breath on the bench and planned my next raid',
    chat: ['I’m scared of getting tackled', 'I raid too fast when I’m nervous', 'I feel the pressure in a do-or-die raid', 'Seniors make me nervous', 'We have a big match on Sunday'],
  },
  tennis: {
    event: 'match', mistake: 'Hit a double fault', worry: 'I always choke on big points.',
    focusWord: 'Watch the ball', resetWord: 'Next point', strongLine: 'I swing freely. One point at a time.',
    moment: 'Serving to stay in the set', watch: 'The ball on the toss',
    routine: { title: 'Between points', steps: ['Turn away and fix your strings', 'One slow breath out', 'Bounce the ball three times', 'Say “Swing free”'] },
    helped: 'Walked to the back, fixed my strings and slowed down',
    chat: ['I double fault under pressure', 'I lose focus after a bad line call', 'I get tight when I’m winning', 'I talk badly to myself on court', 'I have a ranking tournament soon'],
  },
  hockey: {
    event: 'match', mistake: 'Missed a penalty corner', worry: 'I wasted our chance.',
    focusWord: 'Stick down', resetWord: 'Next play', strongLine: 'I see the space. I play my game.',
    moment: 'A penalty corner', watch: 'The ball on your stick',
    routine: { title: 'Before a corner', steps: ['One slow breath out', 'Tap your stick on the turf', 'Look at your target', 'Say “Stick down”'] },
    helped: 'Ran back, called for the ball and got my next touch right',
    chat: ['I panic in the shooting circle', 'I hold the ball too long when nervous', 'My coach yells and I lose focus', 'I play scared in big matches', 'Selection camp is next week'],
  },
  swimming: {
    event: 'race', mistake: 'Had a slow turn', worry: 'My time is ruined.',
    focusWord: 'Long and strong', resetWord: 'Next stroke', strongLine: 'I have done this a thousand times in training.',
    moment: 'On the blocks', watch: 'The black line',
    routine: { title: 'Before my race', steps: ['Two slow breaths', 'Shake out your arms', 'Look at the far wall', 'Say “Long and strong”'] },
    helped: 'Breathed out behind the blocks and only thought about my start',
    chat: ['I feel sick before races', 'I think about my time too much', 'I go out too fast when nervous', 'I swim worse at big meets', 'State meet is this month'],
  },
};

const GENERIC = {
  event: 'match', mistake: 'Made an early mistake', worry: 'Everyone saw that.',
  focusWord: 'Next play', resetWord: 'Reset', strongLine: 'I have trained for this. One moment at a time.',
  moment: 'The first minute', watch: 'One thing right in front of you',
  routine: { title: 'Before I play', steps: ['Two slow breaths', 'Shake out your hands', 'Look at one fixed spot', 'Say “Next play”'] },
  helped: 'One slow breath out, then focus on the next moment',
  chat: ['I get nervous before matches', 'I can’t forget my mistakes', 'I play worse in big matches', 'I lose focus when people watch', 'I have a big event coming up'],
};

// General openers mixed in after the sport ones.
const GENERAL_CHAT = [
  'I can’t sleep the night before',
  'My parents put pressure on me',
  'I compare myself with teammates',
  'I want a routine before I play',
];

export function sportBlock(sport) {
  return SPORTS[String(sport || '').toLowerCase()] || GENERIC;
}

// Example cards for each tool, in the shape ExampleCard expects.
export function toolExamples(sport) {
  const s = sportBlock(sport);
  const big = `Before a big ${s.event}`;
  return {
    selfTalk: { label: 'Example card', title: s.mistake, rows: [
      ['Worried thought', `“${s.worry}”`],
      ['Focus word', `“${s.focusWord}”`],
      ['After a mistake, say', `“${s.resetWord}”`],
      ['Your strong line', `“${s.strongLine}”`],
    ] },
    warmUp: { label: 'Example', title: big, rows: [
      ['How you feel', 'Nervous, heart beating fast'],
      ['The moment', s.moment],
      ['One thing to watch', s.watch],
      ['Your word for today', `“${s.focusWord}”`],
    ] },
    reset: { label: 'Example', title: big, rows: [
      ['Before', 'Body tension 7 out of 10'],
      ['What you do', 'Breathe in 4 seconds, out 6 seconds, for 3 minutes'],
      ['After', 'Body tension 3 out of 10'],
    ] },
    routine: { label: 'Example routine', title: s.routine.title, rows: s.routine.steps.map((x, i) => [`Step ${i + 1}`, x]) },
    journal: { label: 'Example entry', title: `${s.event[0].toUpperCase()}${s.event.slice(1)} day`, rows: [
      ['How you felt', 'Nervous, then calm'],
      ['What happened', s.mistake],
      ['What helped', s.helped],
      ['Next time', `Say “${s.resetWord}” straight away`],
    ] },
  };
}

// Short lines for the Home Mind Journal row.
export function journalLines(sport) {
  const s = sportBlock(sport);
  return [
    `${s.mistake}. What helped: ${s.helped.charAt(0).toLowerCase()}${s.helped.slice(1)}.`,
    `Nervous before the ${s.event}. Saying “${s.focusWord}” helped.`,
    `Good training today. My “${s.routine.title}” routine kept me calm.`,
    `“${s.worry}” — I noticed the thought and let it pass.`,
    `Next ${s.event}: say “${s.resetWord}” straight after a mistake.`,
  ];
}

// Things to say to Arjun in an empty chat: the sport ones first.
export function chatExamples(sport) {
  return [...sportBlock(sport).chat, ...GENERAL_CHAT];
}
