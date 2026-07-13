// Deterministic safety phrase rules — the conservative floor beneath the
// prompt-level (LLM) safety layer, which remains in place as the second
// defensive layer for indirect or contextual distress these rules can't see.
//
// Design rules:
// - PHRASES, not single ambiguous words ("die", "jaan", "blood" alone never
//   match — sports talk is full of them: "sudden death", "killed it",
//   "dead tired", "jaan laga di").
// - Latin phrases match on word boundaries against normalized (lowercased)
//   text. Devanagari phrases use substring matching: \b is ASCII-only in JS
//   and unreliable for Devanagari, and these multi-word phrases are
//   distinctive enough not to need it.
// - Deliberate exclusion: "can't breathe" is NOT in the deterministic lists.
//   It is the single most common way athletes describe pre-match nerves
//   ("I feel like I can't breathe before matches"), and a deterministic rule
//   cannot tell that apart from a medical emergency. The prompt layer, which
//   can read context, keeps covering it (chat.js lists it in both blocks).
// - Matching text is never returned to callers and never persisted.

// Each rule: { category, riskLevel, script, pattern }
// script: 'latin' → regex with word boundaries; 'devanagari' → substring.

function latin(phrase) {
  // Escape regex specials, allow flexible whitespace between words,
  // and require word boundaries at both ends.
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`\\b${escaped}\\b`, 'u');
}

const RULES = [
  // ── 1. Crisis / self-harm ──────────────────────────────────────────────
  // English
  ...[
    'kill myself', 'killing myself', 'want to die', 'wanted to die',
    'end my life', 'ending my life', 'suicide', 'suicidal',
    'self-harm', 'self harm', 'harm myself', 'harming myself',
    'hurt myself', 'hurting myself', 'cut myself', 'cutting myself',
    'want to disappear', 'not worth living', 'no reason to live',
    'rather be dead', 'wish i was dead', 'wish i were dead',
    'end it all', 'better off without me',
  ].map(p => ({ category: 'crisis', riskLevel: 'high', script: 'latin', pattern: latin(p) })),
  // Romanized Hindi / Hinglish
  ...[
    'marna chahta', 'marna chahti', 'mar jana chahta', 'mar jana chahti',
    'jeena nahi chahta', 'jeena nahi chahti', 'jeena nahin chahta', 'jeena nahin chahti',
    'khud ko chot', 'khud ko hurt', 'khud ko nuksan',
    'khudkushi', 'aatmahatya', 'atmahatya',
    'zindagi khatam kar', 'jindagi khatam kar',
    'apni jaan de dunga', 'apni jaan de dungi', 'jaan dena chahta', 'jaan dena chahti',
  ].map(p => ({ category: 'crisis', riskLevel: 'high', script: 'latin', pattern: latin(p) })),
  // Devanagari Hindi
  ...[
    'मरना चाहता', 'मरना चाहती', 'मर जाना चाहता', 'मर जाना चाहती',
    'जीना नहीं चाहता', 'जीना नहीं चाहती',
    'खुद को चोट', 'खुद को नुकसान',
    'खुदकुशी', 'आत्महत्या',
    'ज़िंदगी खत्म कर', 'जिंदगी खत्म कर',
    'अपनी जान दे', 'जान देना चाहता', 'जान देना चाहती',
  ].map(p => ({ category: 'crisis', riskLevel: 'high', script: 'devanagari', pattern: p })),

  // ── 2. Abuse / exploitation / coercion / unsafe contact ───────────────
  // English
  ...[
    'being abused', 'abuses me', 'abusing me', 'sexual abuse', 'sexually abused',
    'molested', 'molests me', 'touches me inappropriately', 'touched me inappropriately',
    'coach hits me', 'coach hit me', 'coach beats me', 'coach beat me',
    'parent hits me', 'father hits me', 'mother hits me', 'hits me at home',
    'beats me at home', 'being bullied', 'bullying me', 'bullies me',
    'threatened me', 'threatens me', 'blackmailing me', 'blackmails me',
    'scared to go home', 'afraid to go home', 'unsafe at home',
    'someone is hurting me', 'someone hurting me',
  ].map(p => ({ category: 'abuse', riskLevel: 'high', script: 'latin', pattern: latin(p) })),
  // Romanized Hindi / Hinglish
  ...[
    'mujhe maarta hai', 'mujhe maarte hain', 'mujhe maarti hai',
    'mujhe peetta hai', 'mujhe peette hain', 'mujhe pitta hai',
    'ghar par maarte', 'ghar pe maarte',
    'dhamki deta hai', 'dhamki dete hain', 'dhamki di hai',
    'galat tarah se chhuta', 'galat jagah chhuta', 'galat tareeke se chhuta',
    'ghar jaane se darr', 'ghar jane se darr', 'ghar mein unsafe', 'ghar me unsafe',
  ].map(p => ({ category: 'abuse', riskLevel: 'high', script: 'latin', pattern: latin(p) })),
  // Devanagari Hindi
  ...[
    'मुझे मारता है', 'मुझे मारते हैं', 'मुझे मारती है',
    'मुझे पीटता है', 'मुझे पीटते हैं',
    'घर पर मारते', 'घर पे मारते',
    'धमकी देता है', 'धमकी देते हैं', 'धमकी दी है',
    'गलत तरह से छूता', 'गलत जगह छूता', 'गलत तरीके से छूता',
    'घर जाने से डर', 'घर में असुरक्षित',
  ].map(p => ({ category: 'abuse', riskLevel: 'high', script: 'devanagari', pattern: p })),

  // ── 3. Urgent physical injury / immediate medical danger ──────────────
  // English
  ...[
    'concussion', 'passed out', 'unconscious', 'blacked out', 'fainted',
    'head injury', 'hit my head', 'neck injury', 'spine injury', 'injured my spine',
    'chest pain', 'bleeding heavily', 'bleeding a lot', 'bleeding badly',
    'bone is sticking', 'can\'t feel my legs', 'cannot feel my legs',
    'can\'t feel my arm', 'cannot feel my arm',
    'vomiting after hitting', 'vomited after hitting', 'seeing double',
  ].map(p => ({ category: 'injury', riskLevel: 'medium', script: 'latin', pattern: latin(p) })),
  // Romanized Hindi / Hinglish
  ...[
    'behosh ho gaya', 'behosh ho gayi', 'behosh hua',
    'sir mein chot', 'sir me chot', 'sar mein chot', 'sar me chot',
    'gardan mein chot', 'gardan me chot',
    'bahut khoon', 'khoon beh raha', 'khoon nikal raha',
    'chaati mein dard', 'chati me dard', 'seene mein dard', 'seene me dard',
    'hosh kho diya', 'hosh chala gaya',
  ].map(p => ({ category: 'injury', riskLevel: 'medium', script: 'latin', pattern: latin(p) })),
  // Devanagari Hindi
  ...[
    'बेहोश हो गया', 'बेहोश हो गई', 'बेहोश हुआ',
    'सिर में चोट', 'सर में चोट',
    'गर्दन में चोट', 'रीढ़ में चोट',
    'बहुत खून', 'खून बह रहा', 'खून निकल रहा',
    'छाती में दर्द', 'सीने में दर्द',
    'होश खो दिया', 'होश चला गया',
  ].map(p => ({ category: 'injury', riskLevel: 'medium', script: 'devanagari', pattern: p })),
];

module.exports = { RULES };
