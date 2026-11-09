// Detects a short "I didn't understand" reply from the athlete — "matlab?",
// "samjha nahi", "kya?", "what?", "huh" — so Coach re-explains its last
// point more simply instead of treating the message as new content.
//
// Founder testing: an athlete replied "Matlab" (= "what do you mean?") and
// Arjun answered "Matlab ka matlab kya? … Bol na clearly" — confused and
// curt. This makes the intent explicit to the model.
//
// Pure and conservative: no I/O, no model call, never rewrites or stores
// the message. Only SHORT messages (MAX_WORDS) that consist of a known
// phrase are matched, so a real sentence that merely contains "matlab" or
// "what" never trips it. The output is internal: appended to the system
// prompt, never streamed or persisted. Logs carry the kind code only.

const MAX_WORDS = 6;

// Whole-message phrases, after normalisation (lowercase, punctuation
// removed, repeated letters collapsed, common spellings folded).
const HINGLISH = [
  'matlab', 'matlab kya', 'kya matlab', 'iska matlab', 'iska matlab kya', 'matlab kya hai', 'kya matlab hai',
  'kya', 'kya bola', 'kya kaha', 'kya bol rahe ho', 'kya keh rahe ho',
  'samjha nahi', 'samjhi nahi', 'samajh nahi aaya', 'samajh nahi aya', 'nahi samjha', 'nahi samjhi',
  'kuch samajh nahi aaya', 'kuch samajh nahi aya', 'samjha nahi yaar', 'samajh nahi aaya yaar',
  'phir se bolo', 'phir se batao', 'dobara batao', 'simple mein batao', 'aasan bhasha mein batao',
];
const ENGLISH = [
  'what', 'huh', 'meaning', 'means', 'what do you mean', 'what does that mean', 'what you mean',
  'i dont understand', 'i didnt understand', 'didnt understand', 'dont understand', 'didnt get it',
  'i didnt get it', 'dont get it', 'i dont get it', 'not clear', 'confused', 'im confused',
  'explain', 'explain again', 'explain please', 'say that again', 'come again', 'sorry what',
];

// Fold common spellings so "samjh nhi aya" == "samajh nahi aya".
const FOLDS = [
  [/\bnhi\b|\bnai\b|\bnahin\b|\bnaa?hi\b/g, 'nahi'],
  [/\bsamjh\b|\bsmjh\b|\bsamaj\b/g, 'samajh'],
  [/\bsmjha\b|\bsamjhaa\b/g, 'samjha'],
  [/\baaya\b|\baayaa\b/g, 'aaya'],
  [/\bkyaa+\b|\bkia\b|\bkya+\b/g, 'kya'],
  [/\bmtlb\b|\bmatlb\b|\bmatlab+\b/g, 'matlab'],
  [/\bdont\b|\bdon t\b/g, 'dont'],
  [/\bdidnt\b|\bdidn t\b/g, 'didnt'],
  [/\bim\b|\bi m\b/g, 'im'],
  [/\bwat\b|\bwht\b|\bwhaa*t\b/g, 'what'],
  [/\bplz\b|\bpls\b/g, 'please'],
];

const PHRASES = new Map([
  ...HINGLISH.map((p) => [p, 'hinglish']),
  ...ENGLISH.map((p) => [p, 'english']),
]);

function normalize(text) {
  let t = String(text || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z\s]/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  for (const [re, to] of FOLDS) t = t.replace(re, to);
  return t.replace(/\b(bro|yaar|sir|bhai|please|ji)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

// Returns { kind: 'hinglish' | 'english' | 'punctuation' } or null.
function detectClarificationRequest(message) {
  const raw = String(message || '').trim();
  if (!raw) return null;
  if (/^\?{1,3}$/.test(raw)) return { kind: 'punctuation' };
  if (raw.split(/\s+/).length > MAX_WORDS) return null;
  const n = normalize(raw);
  if (!n) return null;
  const kind = PHRASES.get(n);
  return kind ? { kind } : null;
}

function buildClarificationSection(hit) {
  if (!hit) return '';
  const style = hit.kind === 'hinglish'
    ? 'They wrote in Hinglish, so reply in simple, warm Hinglish written in English letters.'
    : 'Reply in the same language style they have been using.';
  return `

## The athlete did not understand your last message
Their latest message is a request to explain again, not new content. Re-explain the main point of your previous reply more simply: shorter sentences, everyday words, one idea, and one concrete example from their sport. ${style} Do not ask what they meant, do not comment on their wording, and do not tell them to be clearer. Start with something reassuring, e.g. "Koi baat nahi" / "No problem".`;
}

module.exports = { detectClarificationRequest, buildClarificationSection, normalize, MAX_WORDS };
