// Category-appropriate safety guidance shown when the deterministic screen
// triggers. This copy mirrors the existing prompt-layer safety messages in
// chat.js (same helplines, same tone, same languages) so the athlete sees
// the same guidance regardless of which layer caught the message.
// This is fixed Arjun-authored copy — persisting or displaying it never
// exposes any athlete text.

const MESSAGES = {
  crisis: {
    en: "What you're describing is bigger than sport. Please talk to a trusted adult right now — a parent, teacher, doctor, or coach you trust. If you feel unsafe or at risk, call iCall on 9152987821 or KIRAN on 1800-599-0019 (India, free 24/7) or emergency services on 112. You don't have to handle this alone.",
    hi: 'Jo tum describe kar rahe ho woh sirf sport se bada hai. Abhi kisi trusted adult se baat karo — parent, teacher, doctor, ya coach jis par trust karo. Agar unsafe feel ho raha hai — iCall 9152987821 ya KIRAN 1800-599-0019 (free, 24/7) call karo ya emergency ke liye 112. Akele handle nahi karna hai.',
  },
  // Abuse / unsafe-contact disclosures get the same trusted-adult +
  // helpline guidance as crisis — this matches the existing prompt layer,
  // where abuse phrases live inside the crisis block and produce the same
  // message.
  abuse: {
    en: "What you're describing is bigger than sport. Please talk to a trusted adult right now — a parent, teacher, doctor, or coach you trust. If you feel unsafe or at risk, call iCall on 9152987821 or KIRAN on 1800-599-0019 (India, free 24/7) or emergency services on 112. You don't have to handle this alone.",
    hi: 'Jo tum describe kar rahe ho woh sirf sport se bada hai. Abhi kisi trusted adult se baat karo — parent, teacher, doctor, ya coach jis par trust karo. Agar unsafe feel ho raha hai — iCall 9152987821 ya KIRAN 1800-599-0019 (free, 24/7) call karo ya emergency ke liye 112. Akele handle nahi karna hai.',
  },
  injury: {
    en: "Stop playing immediately. Tell your coach or a trusted adult right now. If you have a head injury, chest pain, can't breathe, or feel seriously hurt — call 112 or go to a doctor now. Do not play on. Arjun cannot assess injuries.",
    hi: 'Abhi khelna band karo. Coach ya kisi trusted adult ko abhi batao. Agar head injury hai, chest mein dard hai, saans nahi aa raha, ya serious chot lagi hai — abhi 112 call karo ya doctor ke paas jao. Injury Arjun assess nahi kar sakta.',
  },
};

function getSafetyGuidance(category, language) {
  const entry = MESSAGES[category] || MESSAGES.crisis;
  return language === 'hi' ? entry.hi : entry.en;
}

module.exports = { getSafetyGuidance };
