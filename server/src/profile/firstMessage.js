// Deterministic first coaching message (PR 3). Built from the confirmed
// profile + agreed priority — never AI-generated, never prescriptive, and it
// does NOT re-ask whether the interpretation fits (that was already resolved
// on the profile screen). It ends on an open question: Coach is a free-text
// conversation, so no reply chips and no [SUGGEST:] tag are attached.

const cfg = require('./ruleConfig');
const { sentences, priorityPhrase } = require('./ruleEngine');

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || (name || '');

function triggerPhrase(priorityId, lang) {
  return cfg.TRIGGER[priorityId]?.[lang]
    || (lang === 'hi' ? 'जिस स्थिति को हमने चुना उसमें' : 'the situation we chose');
}

// Returns the stored assistant Message content — plain prose, no markers.
function buildFirstMessage(profile, ruleOutput, user) {
  const lang = user?.language === 'hi' ? 'hi' : 'en';
  const name = firstName(user?.name);
  const priorityId = profile.agreedPriorityId || ruleOutput.suggestedPriorityId;
  // Conversational phrase, never the raw onboarding display label — the same
  // source the profile confirmation summary uses.
  const focus = priorityPhrase(priorityId, lang, ruleOutput);
  let body;

  if (profile.fitResponse === 'CONFIRMED') {
    // Names the SITUATION the athlete chose and nothing else. The profile they
    // just read shows their own words ("I get angry with myself"); opening the
    // conversation with a rewritten version of them ("frustration with
    // yourself can rise") is exactly the mismatch the simplified profile
    // exists to remove, so the pattern is not restated here at all. Arjun asks
    // about today instead — the barrier is still established in conversation.
    const trigger = triggerPhrase(priorityId, lang);
    body = lang === 'hi'
      ? sentences([`नमस्ते, ${name}। आपसे मिलकर अच्छा लगा।\n\nआपने चुना कि अभी सबसे मुश्किल पल ${trigger} है।`, 'चलिए एक हाल के उदाहरण से शुरू करते हैं — क्या हुआ था?'])
      : sentences([`Hi, ${name}. Great to meet you.\n\nYou told me the moment that gives you the most trouble right now is ${trigger}.`, "Let's start with a recent example — what happened?"]);
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

  return body;
}

module.exports = { buildFirstMessage, triggerPhrase };
