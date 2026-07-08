// Turns GET /api/playbook's rule-based insight key into bilingual copy.
// Language rules: calm, specific, "pattern noticed" — never scores,
// never "mastered", never clinical.
export function insightText(insight, hi) {
  if (!insight) return null;
  switch (insight.key) {
    case 'reset_after_mistake':
      return hi
        ? 'Pattern noticed: गलती के बाद के पल तुम्हारा सबसे बड़ा trigger हैं। तुम्हारा reset cue सबसे ज्यादा मायने रखता है।'
        : 'Pattern noticed: moments after a mistake are your biggest trigger. Your reset cue matters most.';
    case 'nervous_pattern':
      return hi
        ? 'Pattern noticed: खेल से पहले घबराहट आती है। खेलने से पहले एक छोटा reset तुम्हारा सबसे अच्छा रेप है।'
        : 'Pattern noticed: nerves show up before you play. A short reset before you start is your best rep.';
    case 'cue_repeat':
      return hi
        ? `Pattern noticed: तुम बार-बार एक cue पर लौटते हो — "${insight.cue}". छोटे cue तुम्हारे लिए काम कर रहे हैं।`
        : `Pattern noticed: you keep coming back to one cue — "${insight.cue}". Short cues are working for you.`;
    default:
      return null;
  }
}
