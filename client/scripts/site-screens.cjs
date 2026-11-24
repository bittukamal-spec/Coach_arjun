// Real app screenshots for the website phones (docs/PREMIUM-PLAN.md, Step 3).
//
// Opens the real app with demo data (every /api call is answered here, nothing
// touches a real server or account) and saves phone-sized screenshots to
// public/site-screens/. Re-run whenever a screen changes so the website never
// shows an old version:
//
//   cd client && npm run build && npx vite preview --port 4173 &
//   node scripts/site-screens.cjs            # or: node scripts/site-screens.cjs http://localhost:4173
//
// Needs Playwright with Chromium (pre-installed in Claude's cloud sessions).
//
// The viewport is a narrow phone (320 × 628) on purpose: the website phone
// shows the screen at ~268px wide, so a narrower capture keeps the app's
// writing bigger and easier to read (founder asked for it, Nov 2026). 628 =
// the phone's screen area below its drawn status bar (268 × 526, scaled).
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:4173';
const OUT = path.join(__dirname, '..', 'public', 'site-screens');

const user = { id: 'demo', name: 'Rohan Sharma', sport: 'cricket', onboardingDone: true, language: 'en', tier: 'free' };
const now = Date.now();
const iso = (minsAgo) => new Date(now - minsAgo * 60000).toISOString();

const DEMO = {
  '/api/auth/me': { user },
  '/api/sessions': { sessions: [{ id: 's1', sessionType: 'general', createdAt: iso(60) }] },
  '/api/prescriptions/active': { prescription: {
    prescriptionId: 'p1', practiceKey: 'pressure_reset', situation: 'the first over of a match',
    cardContent: 'Breathe in for 4, out for 6. Three rounds.', cueWord: 'Settle',
    status: 'ACTIVE', completedAt: null, outcomeStatus: null,
  } },
  '/api/playbook': {
    weekRepCount: 3, weekResetCount: 2, totalRepCount: 9,
    thisWeek: { practices: 5, reflections: 2, triedCount: 3, helpedCount: 2, activityAt: [iso(60 * 24 * 5), iso(60 * 24 * 3), iso(60 * 24 * 2), iso(60 * 20), iso(30)] },
    focusCards: [{ id: 'c1', focusWord: 'Watch the ball', resetWord: 'Next ball' }],
    savedCues: [{ cue: 'Next ball' }, { cue: 'Early eyes' }, { cue: 'Settle' }],
    practiceOutcomes: [
      { prescriptionId: 'p0', practiceKey: 'pressure_reset', practiceName: 'Pressure Reset', situation: 'the first over', outcomeStatus: 'HELPED', lesson: 'A slow exhale settled my hands.', outcomeRecordedAt: iso(60 * 24 * 2) },
      { prescriptionId: 'p00', practiceKey: 'post_performance_reflection', practiceName: 'Reflection', situation: 'after a dropped catch', outcomeStatus: 'HELPED', lesson: 'Writing it down helped me let it go.', outcomeRecordedAt: iso(60 * 24 * 4) },
    ],
    reflections: [
      { id: 'j1', source: 'mind_journal', createdAt: iso(60 * 24), takeaway: 'Start slower in warm-up.' },
      { id: 'j2', source: 'mind_journal', createdAt: iso(60 * 24 * 3), takeaway: 'Talk to myself like a teammate.' },
    ],
    insight: null,
  },
  '/api/self-talk/cards': [
    { id: 'c1', focusWord: 'Watch the ball', resetWord: 'Next ball', powerLine: 'One ball at a time. I trust my eyes.', performanceMoment: 'Batting under pressure' },
    { id: 'c2', focusWord: 'Smooth and strong', resetWord: 'Reset', powerLine: 'Same run-up, every ball.', performanceMoment: 'Before my run-up' },
  ],
};
const CHAT = { messages: [
  { id: 'm1', role: 'assistant', content: "Hi Rohan. How are you feeling about Saturday's match?", createdAt: iso(9) },
  { id: 'm2', role: 'user', content: 'Nervous. My hands shake at the start.', createdAt: iso(8) },
  { id: 'm3', role: 'assistant', content: "That's normal — your body is getting ready to play. Let's calm it first, then plan your first over. [APP:body-reset]", createdAt: iso(7) },
] };

// Each website screen shows a different sport (founder, Nov 2026), so
// visitors see the app is for every athlete, not only cricketers.
const PEOPLE = {
  rohan: user,
  aarav: { ...user, id: 'demo2', name: 'Aarav Singh', sport: 'football' },
  meera: { ...user, id: 'demo3', name: 'Meera Nair', sport: 'badminton' },
  kabir: { ...user, id: 'demo4', name: 'Kabir Rao', sport: 'tennis' },
  simran: { ...user, id: 'demo5', name: 'Simran Kaur', sport: 'hockey' },
};
const FOOTBALL_CHAT = { messages: [
  { id: 'm1', role: 'assistant', content: 'Hi Aarav. How are you feeling about Sunday’s match?', createdAt: iso(9) },
  { id: 'm2', role: 'user', content: 'Nervous. I hide from the ball after one bad pass.', createdAt: iso(8) },
  { id: 'm3', role: 'assistant', content: 'That happens to a lot of players. After a bad pass, clap once and say “Next action” — then show for the ball again. Want to practise it now? [APP:mental-rep]', createdAt: iso(7) },
] };
const TENNIS_CARDS = [
  { id: 'c1', focusWord: 'Watch the ball', resetWord: 'Next point', powerLine: 'I swing freely. One point at a time.', performanceMoment: 'Serving at break point' },
  { id: 'c2', focusWord: 'Swing free', resetWord: 'Slow down', powerLine: 'Same toss, every serve.', performanceMoment: 'After a double fault' },
];

async function main() {
  const browser = await chromium.launch();
  const shot = async (name, url, person, extra = {}, wait = 1500) => {
    const who = PEOPLE[person];
    const ctx = await browser.newContext({ viewport: { width: 320, height: 628 }, deviceScaleFactor: 2, serviceWorkers: 'block', colorScheme: 'light', reducedMotion: 'reduce' });
    await ctx.addInitScript(u => {
      localStorage.setItem('mg_token', 'demo');
      localStorage.setItem('mg_user', JSON.stringify(u));
      localStorage.setItem('arjun_theme', 'light');
    }, who);
    const page = await ctx.newPage();
    await page.route('**/api/**', route => {
      const p = new URL(route.request().url()).pathname;
      let body;
      if (p === '/api/auth/me') body = { user: who };
      else if (p.endsWith('/messages')) body = extra.chat || CHAT;
      else if (extra[p] !== undefined) body = extra[p];
      else body = DEMO[p] ?? {};
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(BASE + url);
    await page.waitForTimeout(wait);
    await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 82 });
    await ctx.close();
    console.log('saved', name, '·', who.sport);
  };
  await shot('home', '/dashboard', 'rohan');
  await shot('coach', '/coaching', 'aarav', { chat: FOOTBALL_CHAT }, 2200);
  await shot('reset', '/body-reset', 'meera');
  await shot('focus', '/focus-deck', 'kabir', { '/api/self-talk/cards': TENNIS_CARDS });
  await shot('practice', '/my-practice', 'simran');
  await shot('tools', '/tools', 'rohan');
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
