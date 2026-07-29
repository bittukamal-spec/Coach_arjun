// Narrow product-scope check for a custom Current Focus.
//
// This is NOT safety screening and does not replace it. Safety (crisis, self
// harm, abuse, clinical need) runs first and independently in
// profileService.updateCurrentFocus, and a flagged phrase still goes down the
// existing safety pathway with support guidance — it never reaches this file's
// verdict. This layer answers a different, much smaller question: is the
// athlete asking Arjun to coach their sport, or asking for something Arjun
// simply isn't (homework help, shopping advice, travel planning)?
//
// Design: deliberately permissive, deterministic, and no model call.
//
//   ACCEPT unless the text clearly asks for an off-topic service.
//
// That asymmetry is intentional. A rejected valid focus is a worse failure than
// an accepted odd one: the athlete has typed something true about their sport
// and been told it doesn't count. So a short, misspelled, Hinglish or
// grammatically loose phrase is accepted, and only an unmistakable off-topic
// request is refused. This is not a topic classifier and must not grow into
// one.
//
// Pure: no I/O, no model, no logging. It never returns or echoes athlete text.

// Comparison form only — never used to alter what is stored.
function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[^\p{L}\p{N}\p{M}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Off-topic SERVICES an athlete might plausibly ask an app for. Each needs a
// clear request signal too (see below), so "my coach gives me homework about
// footwork" is not caught by "homework".
const OFF_TOPIC = [
  // school / academic work
  'homework', 'assignment', 'exam paper', 'maths', 'math', 'mathematics',
  'algebra', 'geometry', 'calculus', 'physics homework', 'chemistry homework',
  'essay', 'thesis', 'dissertation', 'syllabus', 'board exam', 'entrance exam',
  'jee', 'neet', 'upsc',
  // programming / tech
  'coding', 'programming', 'javascript', 'python code', 'html', 'css',
  'debug my', 'write code', 'app development', 'website',
  // commerce / logistics / life admin
  'laptop', 'mobile phone', 'buy a', 'shopping', 'discount', 'coupon',
  'holiday', 'vacation', 'flight', 'hotel', 'visa', 'passport',
  'recipe', 'cook', 'movie', 'song lyrics', 'stock market', 'crypto',
  'my taxes', 'resume', 'cover letter', 'job interview',
];

// A request for a service, rather than a mention in passing. Without one of
// these the off-topic term is treated as incidental and the text is accepted.
const REQUEST_SIGNAL = /\b(help me|help with|teach me|explain|solve|do my|write my|write me|plan my|choose|pick|buy|find me|give me|i need|can you|how do i|how to)\b/;

// Anything that plausibly relates to sport, training, competition or the
// mental side of performing. Presence of ANY of these overrides an off-topic
// hit — an athlete talking about pressure before their maths exam AND their
// match is still on topic.
const IN_SCOPE = [
  // sport / training / competition
  'sport', 'game', 'match', 'matches', 'tournament', 'competition', 'compete',
  'competing', 'training', 'train', 'practice', 'practise', 'session', 'coach',
  'coaches', 'coaching', 'team', 'teammate', 'teammates', 'captain', 'selection',
  'trials', 'academy', 'ground', 'field', 'court', 'pitch', 'gym', 'warm up',
  'warmup', 'fitness', 'injury', 'injured', 'rehab', 'comeback', 'season',
  'opponent', 'opposition', 'referee', 'umpire', 'score', 'perform',
  'performance', 'play', 'playing', 'played', 'player',
  // sport-specific vocabulary the athlete is likely to use
  'batting', 'bowling', 'bowler', 'batter', 'wicket', 'crease', 'swing',
  'yorker', 'serve', 'smash', 'rally', 'penalty', 'free kick', 'goal',
  'shooting', 'sprint', 'race', 'lap', 'bout', 'ring', 'mat', 'raid',
  // the mental side
  'focus', 'focused', 'concentration', 'concentrate', 'confidence', 'confident',
  'pressure', 'nervous', 'nerves', 'nervousness', 'anxious', 'anxiety',
  'fear', 'scared', 'afraid', 'doubt', 'mistake', 'mistakes', 'error',
  'failure', 'bounce back', 'recover', 'recovery', 'reset', 'calm', 'relax',
  'motivation', 'motivated', 'consistent', 'consistency', 'discipline',
  'routine', 'preparation', 'prepare', 'prepared', 'mindset', 'mental',
  'self talk', 'belief', 'believe', 'trust', 'frustration', 'frustrated',
  'angry', 'anger', 'overthinking', 'overthink', 'expectations', 'communicate',
  'communication', 'speak up', 'body language', 'visualisation', 'visualization',
  // Hinglish / Hindi terms an Indian athlete may type
  'khel', 'match me', 'practice me', 'dabav', 'dabaav', 'pressure me',
  'galti', 'dhyan', 'aatmavishwas', 'himmat', 'tension',
  'खेल', 'मैच', 'ट्रेनिंग', 'अभ्यास', 'दबाव', 'गलती', 'ध्यान', 'फोकस',
  'आत्मविश्वास', 'कोच', 'टीम', 'चोट', 'प्रदर्शन', 'मुक़ाबला', 'मुकाबला',
];

// Whole-token matching, NOT substring. Substring matching silently accepted
// off-topic text: "mat" (wrestling) matched "mathematics" and "lap" matched
// "laptop", so both were treated as sport. Padding with spaces gives word
// boundaries for Latin and Devanagari alike — JS \b is ASCII-only and never
// fires after Devanagari — and multi-word phrases still work.
function hasAny(haystack, terms) {
  const padded = ` ${haystack} `;
  return terms.some((term) => padded.includes(` ${term} `));
}

// Returns { inScope: true } or { inScope: false, reasonCode }. The reasonCode
// is a fixed string — safe to log, and it never contains athlete text.
function checkFocusScope(text) {
  const n = normalize(text);
  if (!n) return { inScope: false, reasonCode: 'EMPTY' };

  // Any in-scope signal at all wins. This is the permissive half of the
  // design: short, misspelled or Hinglish sport phrases pass here.
  if (hasAny(n, IN_SCOPE)) return { inScope: true };

  // No sport signal AND an explicit off-topic service request → out of scope.
  if (hasAny(n, OFF_TOPIC) && REQUEST_SIGNAL.test(n)) {
    return { inScope: false, reasonCode: 'OFF_TOPIC_REQUEST' };
  }

  // No sport signal, but an off-topic subject stated on its own ("school
  // mathematics", "my holiday") is still clearly not a coaching focus.
  if (hasAny(n, OFF_TOPIC)) return { inScope: false, reasonCode: 'OFF_TOPIC_SUBJECT' };

  // Neither signal: an athlete's own words we simply don't recognise. Accept —
  // over-rejecting a real focus is the worse failure, and unrecognised text is
  // far more likely to be a genuine phrasing than an off-topic request.
  return { inScope: true };
}

module.exports = { checkFocusScope, normalize, IN_SCOPE, OFF_TOPIC };
