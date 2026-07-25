// Deterministic starting-profile rule configuration (PR 3). Pure data +
// cautious phrasings keyed by stable PR 2 answer IDs. No scores, diagnoses,
// personality claims, or certainty. The rule ENGINE (ruleEngine.js) consumes
// this; the AI wording layer may only rephrase what the engine renders.

const RULE_VERSION = 1;

// Phrases/terms a starting profile must never contain (validated on both the
// deterministic output and any AI rewrite).
const PROHIBITED_PATTERNS = [
  /diagnos/i, /disorder/i, /\bsevere\b/i, /severity/i, /mental toughness/i,
  /personality type/i, /readiness score/i, /\bweakness(es)?\b/i,
  /you (are|have) (low|poor|weak)/i, /\bscore\b/i, /\branking\b/i,
  /\bdepress/i, /\banxiety disorder/i, /clinical/i, /\btrait\b/i,
];

// Answers that indicate NO problem in their dimension → suppress an observation.
const NEUTRAL_ANSWERS = new Set([
  'reset_quickly', 'havent_noticed', 'it_varies', 'perform_normally',
  'pressure_helps', 'mostly_unchanged', 'depends', 'still_show_up',
  'feel_fine', 'motivates_me', 'none_fit', 'prefer_not_say',
]);

// Quick-recovery answers: suppress a "prolonged" observation and add a gentle
// resilience note instead.
const QUICK_RECOVERY = new Set(['one_two_actions', 'few_minutes', 'settles_at_start', 'first_few_minutes']);
const PROLONGED_RECOVERY = new Set(['most_of_session', 'even_after', 'most_of_performance', 'lingers_after']);

// primary_priority answer id → trigger framing for §2 / §4.
const TRIGGER = {
  before_important_performance: { en: 'before an important performance', hi: 'किसी अहम मुक़ाबले से पहले' },
  pressure_increases:           { en: 'when the pressure increases',      hi: 'जब दबाव बढ़ता है' },
  after_mistake:                { en: 'after a mistake',                  hi: 'गलती के बाद' },
  after_poor_result:            { en: 'after a poor result',              hi: 'खराब नतीजे के बाद' },
  lose_focus:                   { en: 'when your focus drifts',           hi: 'जब ध्यान भटकता है' },
  confidence_drops:             { en: 'when your confidence dips',        hi: 'जब आत्मविश्वास गिरता है' },
  low_motivation:               { en: 'when training motivation is low',  hi: 'जब ट्रेनिंग की प्रेरणा कम होती है' },
  coach_feedback:               { en: 'around coach feedback',            hi: 'कोच के फीडबैक के आसपास' },
  selection_uncertain:          { en: 'when selection feels uncertain',   hi: 'जब सिलेक्शन अनिश्चित लगे' },
  family_expectations:          { en: 'when outside expectations feel heavy', hi: 'जब बाहरी उम्मीदें भारी लगें' },
  injury_return:                { en: 'coming back from injury',          hi: 'चोट से वापसी में' },
};

// branchId → where-we-can-begin phrasing (§4).
const BEGIN = {
  mistakes:        { en: 'what happens in the few seconds after a mistake', hi: 'गलती के बाद के कुछ सेकंड में क्या होता है' },
  pre_performance: { en: 'what you notice in the build-up before you perform', hi: 'खेलने से पहले की तैयारी में आप क्या महसूस करते हैं' },
  focus:           { en: 'when and how your focus tends to drift', hi: 'आपका ध्यान कब और कैसे भटकता है' },
  confidence:      { en: 'what happens to your game when confidence dips', hi: 'आत्मविश्वास गिरने पर आपके खेल पर क्या असर होता है' },
  motivation:      { en: 'what makes training motivation hardest for you', hi: 'ट्रेनिंग की प्रेरणा कब सबसे मुश्किल होती है' },
  coach_selection: { en: 'how feedback or selection pressure affects you', hi: 'फीडबैक या सिलेक्शन का दबाव आप पर कैसे असर करता है' },
  family_outside:  { en: 'how outside expectations affect you when you compete', hi: 'बाहरी उम्मीदें खेलते समय आप पर कैसे असर करती हैं' },
  injury:          { en: 'what is on your mind as you return from injury', hi: 'चोट से लौटते समय आपके मन में क्या है' },
  unsure:          { en: 'which situation feels most worth exploring first', hi: 'कौन सी स्थिति पहले समझने लायक लगती है' },
  custom:          { en: 'the situation you described in your own words', hi: 'जो स्थिति आपने अपने शब्दों में बताई' },
};

// Reaction/effect clauses keyed by `${questionId}:${answerId}`. `dim` groups
// them for the observation cap + precedence. Only meaningful (problem-signal)
// answers are mapped; unmapped answers simply add no clause.
const CLAUSE = {
  // ── mistakes ──
  'mistakes_first_response:keep_thinking':  { dim: 'reaction', en: 'your attention may stay on what went wrong', hi: 'आपका ध्यान गलती पर टिका रह सकता है' },
  'mistakes_first_response:angry_self':     { dim: 'reaction', en: 'frustration with yourself can rise', hi: 'खुद पर झुंझलाहट बढ़ सकती है' },
  'mistakes_first_response:become_cautious':{ dim: 'reaction', en: 'you can become cautious on the next action', hi: 'अगले एक्शन में आप सतर्क हो सकते हैं' },
  'mistakes_first_response:body_tense':     { dim: 'reaction', en: 'your body can tense up', hi: 'आपका शरीर कस सकता है' },
  'mistakes_next:another_mistake':          { dim: 'effect', en: 'another mistake can sometimes follow', hi: 'कभी एक और गलती हो सकती है' },
  'mistakes_next:hesitate':                 { dim: 'effect', en: 'you may hesitate', hi: 'आप हिचकिचा सकते हैं' },
  'mistakes_next:lose_focus':               { dim: 'effect', en: 'your focus may slip for a while', hi: 'कुछ देर ध्यान भटक सकता है' },
  'mistakes_next:confidence_drops':         { dim: 'effect', en: 'confidence may dip for a bit', hi: 'कुछ देर आत्मविश्वास गिर सकता है' },
  // ── pre_performance ──
  'pre_performance_signs:negative_thoughts':{ dim: 'reaction', en: 'negative thoughts can show up', hi: 'नकारात्मक विचार आ सकते हैं' },
  'pre_performance_signs:overthinking':     { dim: 'reaction', en: 'you may start overthinking', hi: 'आप ज़्यादा सोच सकते हैं' },
  'pre_performance_signs:tense_body':       { dim: 'reaction', en: 'your body can feel tense', hi: 'आपका शरीर कसा महसूस हो सकता है' },
  'pre_performance_signs:fast_heartbeat':   { dim: 'reaction', en: 'your heartbeat or breathing can speed up', hi: 'धड़कन या सांस तेज़ हो सकती है' },
  'pre_performance_signs:hard_to_focus':    { dim: 'reaction', en: 'focusing can feel harder', hi: 'ध्यान लगाना मुश्किल लग सकता है' },
  'pre_performance_effect:hesitate':        { dim: 'effect', en: 'you may hesitate early on', hi: 'शुरुआत में आप हिचकिचा सकते हैं' },
  'pre_performance_effect:rush':            { dim: 'effect', en: 'you may rush', hi: 'आप जल्दबाज़ी कर सकते हैं' },
  'pre_performance_effect:too_cautious':    { dim: 'effect', en: 'you may play too cautiously', hi: 'आप बहुत सतर्क खेल सकते हैं' },
  'pre_performance_effect:simple_mistakes': { dim: 'effect', en: 'simple mistakes can creep in', hi: 'आसान गलतियाँ हो सकती हैं' },
  // ── focus ──
  'focus_when:after_mistake':    { dim: 'reaction', en: 'your focus can drift after a mistake', hi: 'गलती के बाद ध्यान भटक सकता है' },
  'focus_when:scoreboard_result':{ dim: 'reaction', en: 'the scoreboard or result can pull your attention', hi: 'स्कोरबोर्ड या नतीजा ध्यान खींच सकता है' },
  'focus_when:own_thoughts':     { dim: 'reaction', en: 'your own thoughts can pull you away from the present', hi: 'अपने विचार आपको वर्तमान से दूर ले जा सकते हैं' },
  'focus_when:crowd_noise':      { dim: 'reaction', en: 'crowd or noise can distract you', hi: 'भीड़ या शोर ध्यान भटका सकता है' },
  'focus_effect:miss_cues':      { dim: 'effect', en: 'you can miss cues', hi: 'आप संकेत चूक सकते हैं' },
  'focus_effect:slow_reactions': { dim: 'effect', en: 'your reactions can slow', hi: 'आपकी प्रतिक्रिया धीमी हो सकती है' },
  'focus_effect:wrong_decisions':{ dim: 'effect', en: 'decisions can become less sharp', hi: 'फैसले कम तेज़ हो सकते हैं' },
  // ── confidence ──
  'confidence_trigger:after_mistake':    { dim: 'reaction', en: 'confidence may drop after a mistake', hi: 'गलती के बाद आत्मविश्वास गिर सकता है' },
  'confidence_trigger:comparing_others': { dim: 'reaction', en: 'comparing with others can lower it', hi: 'दूसरों से तुलना इसे कम कर सकती है' },
  'confidence_trigger:being_watched':    { dim: 'reaction', en: 'being watched can affect it', hi: 'देखे जाने पर असर पड़ सकता है' },
  'confidence_effect:play_safe':         { dim: 'effect', en: 'you may start playing safe', hi: 'आप सुरक्षित खेलने लग सकते हैं' },
  'confidence_effect:hesitate':          { dim: 'effect', en: 'you may hesitate', hi: 'आप हिचकिचा सकते हैं' },
  'confidence_effect:avoid_the_ball':    { dim: 'effect', en: 'you may avoid the ball or the moment', hi: 'आप गेंद या पल से बच सकते हैं' },
  // ── motivation ──
  'motivation_when:after_bad_result':    { dim: 'reaction', en: 'a bad result can make training feel harder', hi: 'खराब नतीजे के बाद ट्रेनिंग कठिन लग सकती है' },
  'motivation_when:repetitive_training': { dim: 'reaction', en: 'repetitive training can feel flat', hi: 'एक जैसी ट्रेनिंग फीकी लग सकती है' },
  'motivation_when:no_clear_goal':       { dim: 'reaction', en: 'it dips when a clear goal is missing', hi: 'साफ लक्ष्य न होने पर यह गिरती है' },
  'motivation_effect:skip_or_shorten':   { dim: 'effect', en: 'you may skip or shorten sessions', hi: 'आप सेशन छोड़ या छोटा कर सकते हैं' },
  'motivation_effect:go_through_motions': { dim: 'effect', en: 'you may just go through the motions', hi: 'आप बस निभा सकते हैं' },
  // ── coach_selection ──
  'coach_selection_moment:critical_feedback':  { dim: 'reaction', en: 'critical feedback can weigh on you', hi: 'आलोचनात्मक फीडबैक भारी पड़ सकता है' },
  'coach_selection_moment:being_compared':     { dim: 'reaction', en: 'being compared can add pressure', hi: 'तुलना दबाव बढ़ा सकती है' },
  'coach_selection_moment:selection_uncertain':{ dim: 'reaction', en: 'selection uncertainty can sit on your mind', hi: 'सिलेक्शन की अनिश्चितता मन पर रह सकती है' },
  'coach_selection_effect:overthink':          { dim: 'effect', en: 'you may overthink', hi: 'आप ज़्यादा सोच सकते हैं' },
  'coach_selection_effect:play_safe':          { dim: 'effect', en: 'you may play safe', hi: 'आप सुरक्षित खेल सकते हैं' },
  'coach_selection_effect:try_too_hard':       { dim: 'effect', en: 'you may try too hard', hi: 'आप बहुत ज़ोर लगा सकते हैं' },
  // ── family_outside ──
  'family_outside_effect:extra_pressure':    { dim: 'reaction', en: 'outside expectations can add pressure', hi: 'बाहरी उम्मीदें दबाव बढ़ा सकती हैं' },
  'family_outside_effect:fear_letting_down': { dim: 'reaction', en: 'a fear of letting people down can show up', hi: 'निराश करने का डर आ सकता है' },
  'family_outside_effect:play_safe':         { dim: 'effect', en: 'you may play safe', hi: 'आप सुरक्षित खेल सकते हैं' },
  'family_outside_effect:overthink':         { dim: 'effect', en: 'you may overthink', hi: 'आप ज़्यादा सोच सकते हैं' },
  // ── injury ──
  'injury_concern:re_injury_fear':       { dim: 'reaction', en: 'a fear of re-injury can hold you back', hi: 'दोबारा चोट का डर रोक सकता है' },
  'injury_concern:hesitate_in_contests': { dim: 'reaction', en: 'you may hesitate in contests', hi: 'मुक़ाबलों में आप हिचकिचा सकते हैं' },
  'injury_concern:lost_form':            { dim: 'effect', en: 'worry about lost form can linger', hi: 'फॉर्म खोने की चिंता बनी रह सकती है' },
  'injury_concern:frustrated_impatient': { dim: 'reaction', en: 'frustration or impatience can build', hi: 'निराशा या बेसब्री बढ़ सकती है' },
  // ── custom (structured neutral follow-ups) ──
  'custom_response:body_tense':       { dim: 'reaction', en: 'your body can tense up', hi: 'आपका शरीर कस सकता है' },
  'custom_response:negative_thoughts':{ dim: 'reaction', en: 'negative thoughts can show up', hi: 'नकारात्मक विचार आ सकते हैं' },
  'custom_response:lose_focus':       { dim: 'reaction', en: 'your focus can slip', hi: 'आपका ध्यान भटक सकता है' },
  'custom_response:hesitate':         { dim: 'reaction', en: 'you may hesitate', hi: 'आप हिचकिचा सकते हैं' },
  'custom_effect:rush':               { dim: 'effect', en: 'you may rush', hi: 'आप जल्दबाज़ी कर सकते हैं' },
  'custom_effect:too_cautious':       { dim: 'effect', en: 'you may play too cautiously', hi: 'आप बहुत सतर्क खेल सकते हैं' },
  'custom_effect:simple_mistakes':    { dim: 'effect', en: 'simple mistakes can creep in', hi: 'आसान गलतियाँ हो सकती हैं' },
  // ── unsure recognition ──
  'unsure_recognition:differ_comp_vs_training':{ dim: 'reaction', en: 'you play differently in competition than in training', hi: 'आप मुक़ाबले में ट्रेनिंग से अलग खेलते हैं' },
  'unsure_recognition:one_mistake_snowballs':  { dim: 'reaction', en: 'one mistake can affect several actions after it', hi: 'एक गलती बाद के कई एक्शन पर असर डाल सकती है' },
  'unsure_recognition:hesitate_under_pressure':{ dim: 'reaction', en: 'you can hesitate under pressure even when you know what to do', hi: 'दबाव में आप जानते हुए भी हिचकिचा सकते हैं' },
  'unsure_recognition:focus_leaves_present':   { dim: 'reaction', en: 'your focus can move away from the present moment', hi: 'आपका ध्यान वर्तमान पल से हट सकता है' },
  'unsure_recognition:compare_to_others':      { dim: 'reaction', en: 'you can compare yourself with other athletes', hi: 'आप खुद की दूसरों से तुलना कर सकते हैं' },
  'unsure_recognition:struggle_consistency':   { dim: 'reaction', en: 'training consistently can be a struggle', hi: 'लगातार ट्रेनिंग करना मुश्किल हो सकता है' },
  'unsure_recognition:pressure_to_prove':      { dim: 'reaction', en: 'you can feel pressure to prove yourself', hi: 'खुद को साबित करने का दबाव महसूस हो सकता है' },
};

// A short duration clause when recovery is prolonged (added at most once).
const DURATION_PROLONGED = { en: 'and this can linger for much of the session', hi: 'और यह अधिकतर सेशन तक बना रह सकता है' };
const RESILIENCE_NOTE = { en: 'You also said you often recover fairly quickly', hi: 'आपने यह भी बताया कि आप अक्सर जल्दी संभल जाते हैं' };

// Supports / strengths → "what already helps" clauses.
const SUPPORT_PHRASE = {
  clear_preparation:     { en: 'clear preparation', hi: 'साफ तैयारी' },
  one_action_focus:      { en: 'focusing on one action', hi: 'एक एक्शन पर ध्यान' },
  pre_routine:           { en: 'a routine before you perform', hi: 'खेलने से पहले एक रूटीन' },
  helpful_words:         { en: 'helpful words to yourself', hi: 'खुद से मददगार बातें' },
  staying_relaxed:       { en: 'staying relaxed', hi: 'शांत रहना' },
  encouragement:         { en: 'encouragement from someone', hi: 'किसी का प्रोत्साहन' },
  physically_ready:      { en: 'feeling physically ready', hi: 'शारीरिक रूप से तैयार महसूस करना' },
  remembering_success:   { en: 'remembering past success', hi: 'पिछली सफलता याद करना' },
  enjoying_moment:       { en: 'enjoying the moment', hi: 'पल का आनंद लेना' },
  competing_aggressively:{ en: 'competing aggressively', hi: 'आक्रामक होकर खेलना' },
};
const STRENGTH_PHRASE = {
  hard_working:  { en: 'hard-working', hi: 'मेहनती' },
  brave:         { en: 'brave', hi: 'साहसी' },
  disciplined:   { en: 'disciplined', hi: 'अनुशासित' },
  competitive:   { en: 'competitive', hi: 'प्रतिस्पर्धी' },
  calm:          { en: 'calm', hi: 'शांत' },
  persistent:    { en: 'persistent', hi: 'दृढ़' },
  quick_learner: { en: 'a quick learner', hi: 'जल्दी सीखने वाला' },
  supportive:    { en: 'a supportive teammate', hi: 'सहयोगी साथी' },
  honest_self:   { en: 'honest with yourself', hi: 'खुद के साथ ईमानदार' },
};

// Descriptive labels for §1.
const GOAL_LABEL = {
  focus: { en: 'focus', hi: 'फोकस' }, pressure: { en: 'handling pressure', hi: 'दबाव संभालना' },
  nerves: { en: 'pre-performance nerves', hi: 'परफॉर्मेंस से पहले की घबराहट' }, confidence: { en: 'confidence', hi: 'आत्मविश्वास' },
  resilience: { en: 'bouncing back from setbacks', hi: 'असफलता से उबरना' }, motivation: { en: 'staying motivated', hi: 'प्रेरित रहना' },
  communication: { en: 'team communication', hi: 'टीम संचार' }, injury: { en: 'dealing with injury', hi: 'चोट से निपटना' },
};
const OUTCOME_LABEL = {
  recover_faster: { en: 'recover faster after mistakes', hi: 'गलतियों के बाद जल्दी संभलना' },
  feel_prepared: { en: 'feel more prepared before competing', hi: 'मुक़ाबले से पहले ज़्यादा तैयार महसूस करना' },
  stay_focused: { en: 'stay focused for longer', hi: 'ज़्यादा देर ध्यान बनाए रखना' },
  trust_under_pressure: { en: 'trust yourself under pressure', hi: 'दबाव में खुद पर भरोसा करना' },
  train_consistently: { en: 'train more consistently', hi: 'ज़्यादा नियमित ट्रेनिंग करना' },
  handle_feedback: { en: 'handle feedback better', hi: 'फीडबैक बेहतर संभालना' },
  enjoy_competing: { en: 'enjoy competing more', hi: 'मुक़ाबले का ज़्यादा आनंद लेना' },
  return_confident: { en: 'return confidently after injury', hi: 'चोट के बाद आत्मविश्वास से लौटना' },
  understand_barrier: { en: 'understand what is holding you back', hi: 'समझना कि क्या रोक रहा है' },
};
const SPORT_LABEL = {
  cricket: { en: 'cricket', hi: 'क्रिकेट' }, football: { en: 'football', hi: 'फुटबॉल' }, badminton: { en: 'badminton', hi: 'बैडमिंटन' },
  athletics: { en: 'athletics', hi: 'एथलेटिक्स' }, wrestling: { en: 'wrestling', hi: 'कुश्ती' }, boxing: { en: 'boxing', hi: 'मुक्केबाज़ी' },
  kabaddi: { en: 'kabaddi', hi: 'कबड्डी' }, tennis: { en: 'tennis', hi: 'टेनिस' }, hockey: { en: 'hockey', hi: 'हॉकी' }, swimming: { en: 'swimming', hi: 'तैराकी' },
};

module.exports = {
  RULE_VERSION, PROHIBITED_PATTERNS, NEUTRAL_ANSWERS, QUICK_RECOVERY, PROLONGED_RECOVERY,
  TRIGGER, BEGIN, CLAUSE, DURATION_PROLONGED, RESILIENCE_NOTE,
  SUPPORT_PHRASE, STRENGTH_PHRASE, GOAL_LABEL, OUTCOME_LABEL, SPORT_LABEL,
};
