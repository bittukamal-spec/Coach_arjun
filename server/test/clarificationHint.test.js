// English-first + Hinglish-friendly Coach (Nov 2026): short "I didn't
// understand" replies are detected and Coach is told to re-explain simply.

const test = require('node:test');
const assert = require('node:assert/strict');

const { detectClarificationRequest, buildClarificationSection } = require('../src/services/coaching/clarificationHint');
const { buildSystemPrompt } = require('../src/routes/chat');

test('short Hinglish "didn\'t understand" replies are detected, across common spellings', () => {
  for (const m of ['Matlab', 'matlab?', 'Mtlb??', 'kya matlab', 'Kya?', 'samjha nahi', 'samjh nhi aya', 'Samajh nahi aaya yaar', 'nahi samjha bhai', 'phir se batao', 'kuch samajh nahi aaya']) {
    assert.equal(detectClarificationRequest(m)?.kind, 'hinglish', m);
  }
});

test('short English ones too, plus a bare question mark', () => {
  for (const m of ['What?', 'huh', "I don't understand", 'didnt get it', 'what do you mean', 'Confused', 'explain again please']) {
    assert.equal(detectClarificationRequest(m)?.kind, 'english', m);
  }
  assert.equal(detectClarificationRequest('??')?.kind, 'punctuation');
});

test('real sentences that merely contain the words are never matched', () => {
  for (const m of [
    'Matlab main nervous ho jata hoon jab fast bowler aata hai',
    'what should I do before batting',
    'kya main kal khel sakta hoon',
    'I understand, but the second step is hard',
    'nervous hoon',
    '',
  ]) {
    assert.equal(detectClarificationRequest(m), null, m);
  }
});

test('the prompt section asks for a simpler re-explanation in their style, and is empty with no hit', () => {
  assert.equal(buildClarificationSection(null), '');
  const s = buildClarificationSection({ kind: 'hinglish' });
  assert.match(s, /did not understand your last message/);
  assert.match(s, /Hinglish written in English letters/);
  assert.match(s, /Do not ask what they meant/);
});

test('English Coach prompt: Hinglish-friendly, no Devanagari unless the athlete uses it, never curt', () => {
  const prompt = buildSystemPrompt({ name: 'A', sport: 'Cricket', language: 'en' }, [], [], null, {});
  assert.match(prompt, /CRITICAL: Respond ONLY in English, or in Hinglish written in English letters/);
  assert.match(prompt, /Never use Devanagari script unless the athlete writes in Devanagari/);
  assert.match(prompt, /Bad: "Bol na clearly\."/);
  assert.match(prompt, /re-explain that point more simply/);
  assert.match(prompt, /Direct never means curt/);
  // Safety blocks untouched.
  assert.match(prompt, /## Crisis detection and emotional safety/);
  assert.match(prompt, /Safety overrides everything/);
});

test('Coach prompt: one main question per reply, choices allowed, value first, and a step after 2-3 exchanges', () => {
  const prompt = buildSystemPrompt({ name: 'A', sport: 'Cricket', language: 'en' }, [], [], null, {});
  assert.match(prompt, /QUESTIONS \(this is a phone chat with a teenager/);
  assert.match(prompt, /One main question per reply\. It may offer 2–3 short choices/);
  assert.match(prompt, /Never three or more questions in one reply/);
  assert.match(prompt, /A reply must never be only questions/);
  assert.match(prompt, /After about 2–3 back-and-forths on the same problem, give one small practical step/);
  assert.match(prompt, /Did I ask at most one main question/);
  assert.match(prompt, /## Crisis detection and emotional safety/);
});
