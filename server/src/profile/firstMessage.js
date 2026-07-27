// Deterministic first coaching message (PR 3). Built from the confirmed
// profile + agreed priority — never AI-generated, never prescriptive, and it
// does NOT re-ask whether the interpretation fits (that was already resolved
// on the profile screen). Quick replies use the existing [SUGGEST: …] chip
// mechanism the client already parses (ChatPage.extractSuggestions).

const cfg = require('./ruleConfig');
const { joinClauses, sentences, tidy, priorityPhrase } = require('./ruleEngine');

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || (name || '');

function triggerPhrase(priorityId, lang) {
  return cfg.TRIGGER[priorityId]?.[lang]
    || (lang === 'hi' ? 'जिस स्थिति को हमने चुना उसमें' : 'the situation we chose');
}

// Short, non-prescriptive summary of the agreed pattern for the CONFIRMED path.
function shortPattern(ruleOutput, lang) {
  const trigger = triggerPhrase(ruleOutput.agreedPriorityId || ruleOutput.priorityId, lang);
  const clauses = (ruleOutput.observations || [])
    .slice(0, 2)
    .map((o) => (o.dim === 'duration' ? cfg.DURATION_PROLONGED[lang] : cfg.CLAUSE[o.code]?.[lang]))
    .filter(Boolean);
  if (clauses.length === 0) {
    return lang === 'hi' ? `${trigger} चीज़ें कठिन हो सकती हैं` : `things can get harder ${trigger}`;
  }
  // Same composer as the profile sections — connectors are added exactly once,
  // by the composer, never carried in by a clause.
  const joined = joinClauses(clauses, lang);
  return tidy(lang === 'hi' ? `${trigger} ${joined}` : `${trigger}, ${joined}`);
}

const QUICK = {
  en: 'In my last match | In training | It happens often | Something else',
  hi: 'पिछले मैच में | ट्रेनिंग में | अक्सर होता है | कुछ और',
};

// Returns the stored assistant Message content, including the SUGGEST tag.
function buildFirstMessage(profile, ruleOutput, user) {
  const lang = user?.language === 'hi' ? 'hi' : 'en';
  const name = firstName(user?.name);
  const priorityId = profile.agreedPriorityId || ruleOutput.suggestedPriorityId;
  const roWithAgreed = { ...ruleOutput, agreedPriorityId: priorityId };
  // Conversational phrase, never the raw onboarding display label — the same
  // source the profile confirmation summary uses.
  const focus = priorityPhrase(priorityId, lang, ruleOutput);
  let body;

  if (profile.fitResponse === 'CONFIRMED') {
    const pat = shortPattern(roWithAgreed, lang);
    body = lang === 'hi'
      ? sentences([`नमस्ते, ${name}। आपसे मिलकर अच्छा लगा।\n\nआपने बताया कि ${pat}।`, 'चलिए एक हाल के उदाहरण से शुरू करते हैं — क्या हुआ था?'])
      : sentences([`Hi, ${name}. Great to meet you.\n\nYou shared that ${pat}.`, "Let's start with a recent example — what happened?"]);
  } else if (profile.fitResponse === 'PARTLY') {
    body = lang === 'hi'
      ? sentences([`नमस्ते, ${name}। सुधारने के लिए धन्यवाद।`, `हम ${focus} — इसी को समझने से शुरू करेंगे।`, 'किसी हाल के ट्रेनिंग या मुक़ाबले के पल के बारे में सोचें जब यह दिखा — क्या हुआ था?'])
      : sentences([`Hi, ${name}. Thanks for correcting that.`, `We'll start by exploring ${focus}.`, 'Think of a recent training or competition moment when this showed up — what happened?']);
  } else {
    // NOT_REALLY
    body = lang === 'hi'
      ? sentences([`नमस्ते, ${name}। साफ़ बताने के लिए धन्यवाद।`, `हम इसके बजाय ${focus} — इसी को समझने से शुरू करेंगे।`, 'किसी हाल के पल के बारे में बताएं जब इसने आप पर असर डाला।'])
      : sentences([`Hi, ${name}. Thanks for being clear.`, `We'll begin instead by exploring ${focus}.`, 'Tell me about a recent moment when it affected you.']);
  }

  return `${body}\n[SUGGEST: ${QUICK[lang]}]`;
}

module.exports = { buildFirstMessage, shortPattern, triggerPhrase };
