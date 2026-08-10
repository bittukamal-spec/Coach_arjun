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
  'extra_energy_helps', 'nothing_outside',
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

// Conversational phrase for a priority, for use INSIDE a sentence. The
// onboarding option labels ("When the pressure increases") are display labels
// for a list — dropping one into prose reads as a raw label, so prose always
// comes from here instead. Keyed by the same stable difficult_moments ids.
const PRIORITY_PHRASE = {
  before_important_performance: { en: 'what happens in the build-up to an important performance', hi: 'किसी अहम मुक़ाबले की तैयारी में क्या होता है' },
  pressure_increases:           { en: 'what happens when the pressure increases', hi: 'दबाव बढ़ने पर क्या होता है' },
  after_mistake:                { en: 'what happens after a mistake', hi: 'गलती के बाद क्या होता है' },
  after_poor_result:            { en: 'what happens after a poor result', hi: 'खराब नतीजे के बाद क्या होता है' },
  lose_focus:                   { en: 'what pulls your focus away', hi: 'आपका ध्यान क्या भटकाता है' },
  confidence_drops:             { en: 'what happens when your confidence drops', hi: 'आत्मविश्वास गिरने पर क्या होता है' },
  low_motivation:               { en: 'what makes training consistency harder', hi: 'लगातार ट्रेनिंग करना क्या मुश्किल बनाता है' },
  coach_feedback:               { en: 'how coach feedback affects you', hi: 'कोच का फीडबैक आप पर कैसे असर करता है' },
  selection_uncertain:          { en: 'how selection uncertainty affects you', hi: 'सिलेक्शन की अनिश्चितता आप पर कैसे असर करती है' },
  family_expectations:          { en: 'how outside expectations affect you', hi: 'बाहरी उम्मीदें आप पर कैसे असर करती हैं' },
  injury_return:                { en: 'what makes returning from injury difficult', hi: 'चोट से वापसी क्या मुश्किल बनाती है' },
};

// Athlete-facing ACTION label for a focus, keyed by the same stable
// difficult_moments ids. PRIORITY_PHRASE is prose for the middle of a
// sentence ("what happens after a mistake"); this is the short, active thing
// the athlete is working on, for a card headline ("Bounce back after
// mistakes"). Purely a display label — it adds no psychological conclusion
// and maps 1:1 onto an id the athlete themselves selected.
const FOCUS_ACTION_LABEL = {
  before_important_performance: { en: 'Feel ready before you compete', hi: 'मुक़ाबले से पहले तैयार महसूस करना' },
  pressure_increases:           { en: 'Handle pressure with more control', hi: 'दबाव को बेहतर तरीके से संभालना' },
  after_mistake:                { en: 'Bounce back after mistakes', hi: 'गलती के बाद जल्दी संभलना' },
  after_poor_result:            { en: 'Move on from a poor result', hi: 'खराब नतीजे को पीछे छोड़ना' },
  lose_focus:                   { en: 'Regain focus', hi: 'ध्यान वापस पाना' },
  confidence_drops:             { en: 'Rebuild confidence', hi: 'आत्मविश्वास दोबारा बनाना' },
  low_motivation:               { en: 'Stay consistent', hi: 'लगातार बने रहना' },
  coach_feedback:               { en: 'Respond better to feedback', hi: 'फीडबैक पर बेहतर प्रतिक्रिया देना' },
  selection_uncertain:          { en: 'Handle selection uncertainty', hi: 'सिलेक्शन की अनिश्चितता संभालना' },
  family_expectations:          { en: 'Manage outside expectations', hi: 'बाहरी उम्मीदों को संभालना' },
  injury_return:                { en: 'Return with confidence', hi: 'आत्मविश्वास के साथ वापसी करना' },
};

// The one id the athlete may send for "Something else", plus the label used
// when they have written their own focus but the text is unusable.
const CUSTOM_FOCUS_ID = 'different';
const CUSTOM_FOCUS_FALLBACK_LABEL = { en: 'Something you named yourself', hi: 'जो आपने खुद बताया' };

// Playing context + experience, for the athlete snapshot. Collected in
// onboarding (competition_level / experience_level) but deliberately NOT part
// of the frozen ruleOutput — they are read from the linked OnboardingSession
// at serialize time, so no existing profile has to be regenerated.
const LEVEL_LABEL = {
  recreational:  { en: 'Recreational', hi: 'शौकिया' },
  local:         { en: 'Local', hi: 'स्थानीय' },
  state:         { en: 'State', hi: 'राज्य स्तर' },
  national:      { en: 'National', hi: 'राष्ट्रीय' },
  international: { en: 'International', hi: 'अंतरराष्ट्रीय' },
};
const EXPERIENCE_LABEL = {
  beginner:     { en: 'Beginner', hi: 'शुरुआती' },
  amateur:      { en: 'Amateur', hi: 'शौकिया' },
  competitive:  { en: 'Competitive', hi: 'प्रतिस्पर्धी' },
  professional: { en: 'Professional', hi: 'पेशेवर' },
};

// Cautious conversational fallbacks when the athlete named no single priority.
const PRIORITY_PHRASE_FALLBACK = {
  custom:  { en: 'what happens in the situation you wrote about', hi: 'जो स्थिति आपने लिखी, उसमें क्या होता है' },
  generic: { en: 'what tends to happen in the moments that feel hardest', hi: 'जो पल सबसे कठिन लगते हैं, उनमें आमतौर पर क्या होता है' },
};

// The coaching sequence §4 always ends on: understand the pattern first, then
// choose something practical. Never a prescribed practice at this stage.
const BEGIN_SEQUENCE = {
  en: "First we'll understand the pattern clearly. Then we can choose something practical to test.",
  hi: 'पहले हम पैटर्न को साफ़ तौर पर समझेंगे। फिर हम आज़माने के लिए कुछ व्यावहारिक चुन सकते हैं।',
};

// branchId → where-we-can-begin phrasing (§4).
const BEGIN = {
  mistakes:        { en: 'what happens in the few seconds that follow', hi: 'उसके बाद के कुछ सेकंड में क्या होता है' },
  pre_performance: { en: 'what you notice in the build-up', hi: 'तैयारी के दौरान आप क्या महसूस करते हैं' },
  focus:           { en: 'when and how your attention moves', hi: 'आपका ध्यान कब और कैसे हटता है' },
  confidence:      { en: 'what changes in your game then', hi: 'तब आपके खेल में क्या बदलता है' },
  motivation:      { en: 'what makes it hardest to get started', hi: 'शुरू करना कब सबसे मुश्किल होता है' },
  coach_selection: { en: 'how it affects the way you play afterwards', hi: 'इसके बाद आपके खेलने के तरीके पर क्या असर होता है' },
  family_outside:  { en: 'how it affects you when you compete', hi: 'मुक़ाबले के समय यह आप पर कैसे असर करता है' },
  injury:          { en: 'what is on your mind then', hi: 'तब आपके मन में क्या रहता है' },
  // Not "which situation matters most" — onboarding already settled that, and
  // the recognition the athlete picked names the moment (see UNSURE_TRIGGER).
  unsure:          { en: 'what actually happens for you in that moment', hi: 'उस पल में असल में आपके साथ क्या होता है' },
  custom:          { en: 'what happens for you in that situation', hi: 'उस स्थिति में आपके साथ क्या होता है' },
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
  'mistakes_first_response:rush_correct':   { dim: 'reaction', en: 'you can rush to put it right straight away', hi: 'आप तुरंत सुधारने की जल्दी कर सकते हैं' },
  'mistakes_first_response:look_to_others': { dim: 'reaction', en: 'you can look to others for a reaction', hi: 'आप दूसरों की प्रतिक्रिया देखने लगते हैं' },
  'mistakes_next:confidence_drops':         { dim: 'effect', en: 'confidence may dip for a bit', hi: 'कुछ देर आत्मविश्वास गिर सकता है' },
  'mistakes_next:too_aggressive':           { dim: 'effect', en: 'you may go too hard trying to make up for it', hi: 'भरपाई की कोशिश में आप ज़रूरत से ज़्यादा आक्रामक हो सकते हैं' },
  'mistakes_next:stop_communicating':       { dim: 'effect', en: 'you may go quiet with your team', hi: 'आप टीम से बात करना कम कर सकते हैं' },
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
  'pre_performance_signs:restless':         { dim: 'reaction', en: 'you can feel restless', hi: 'आप बेचैन महसूस कर सकते हैं' },
  'pre_performance_signs:low_flat':         { dim: 'reaction', en: 'you can feel low or flat', hi: 'आप सुस्त या फीका महसूस कर सकते हैं' },
  'pre_performance_effect:lose_focus':      { dim: 'effect', en: 'your focus can slip early on', hi: 'शुरुआत में ध्यान भटक सकता है' },
  // ── focus ──
  'focus_when:after_mistake':    { dim: 'reaction', en: 'your focus can drift after a mistake', hi: 'गलती के बाद ध्यान भटक सकता है' },
  'focus_when:scoreboard_result':{ dim: 'reaction', en: 'the scoreboard or result can pull your attention', hi: 'स्कोरबोर्ड या नतीजा ध्यान खींच सकता है' },
  'focus_when:own_thoughts':     { dim: 'reaction', en: 'your own thoughts can pull you away from the present', hi: 'अपने विचार आपको वर्तमान से दूर ले जा सकते हैं' },
  'focus_when:crowd_noise':      { dim: 'reaction', en: 'crowd or noise can distract you', hi: 'भीड़ या शोर ध्यान भटका सकता है' },
  'focus_effect:miss_cues':      { dim: 'effect', en: 'you can miss cues', hi: 'आप संकेत चूक सकते हैं' },
  'focus_effect:slow_reactions': { dim: 'effect', en: 'your reactions can slow', hi: 'आपकी प्रतिक्रिया धीमी हो सकती है' },
  'focus_when:before_start':     { dim: 'reaction', en: 'your focus can drift before play starts', hi: 'खेल शुरू होने से पहले ध्यान भटक सकता है' },
  'focus_when:opponent':         { dim: 'reaction', en: 'the opponent can pull your attention', hi: 'सामने वाला खिलाड़ी ध्यान खींच सकता है' },
  'focus_when:late_in_game':     { dim: 'reaction', en: 'your focus can drift late in the game', hi: 'खेल के आख़िरी हिस्से में ध्यान भटक सकता है' },
  'focus_effect:wrong_decisions':{ dim: 'effect', en: 'decisions can become less sharp', hi: 'फैसले कम तेज़ हो सकते हैं' },
  'focus_effect:stop_communicating': { dim: 'effect', en: 'you may talk less with your team', hi: 'आप टीम से कम बात कर सकते हैं' },
  'focus_effect:energy_drops':   { dim: 'effect', en: 'your energy can drop', hi: 'आपकी ऊर्जा गिर सकती है' },
  // ── confidence ──
  'confidence_trigger:after_mistake':    { dim: 'reaction', en: 'confidence may drop after a mistake', hi: 'गलती के बाद आत्मविश्वास गिर सकता है' },
  'confidence_trigger:comparing_others': { dim: 'reaction', en: 'comparing with others can lower it', hi: 'दूसरों से तुलना इसे कम कर सकती है' },
  'confidence_trigger:being_watched':    { dim: 'reaction', en: 'being watched can affect it', hi: 'देखे जाने पर असर पड़ सकता है' },
  'confidence_effect:play_safe':         { dim: 'effect', en: 'you may start playing safe', hi: 'आप सुरक्षित खेलने लग सकते हैं' },
  'confidence_effect:hesitate':          { dim: 'effect', en: 'you may hesitate', hi: 'आप हिचकिचा सकते हैं' },
  'confidence_trigger:after_poor_result':{ dim: 'reaction', en: 'a poor result can knock it', hi: 'खराब नतीजा इसे हिला सकता है' },
  'confidence_trigger:strong_opponent':  { dim: 'reaction', en: 'a strong opponent can shake it', hi: 'मजबूत प्रतिद्वंद्वी इसे हिला सकता है' },
  'confidence_trigger:early_setback':    { dim: 'reaction', en: 'an early setback can knock it', hi: 'शुरुआती झटका इसे गिरा सकता है' },
  'confidence_effect:avoid_the_ball':    { dim: 'effect', en: 'you may avoid the ball or the moment', hi: 'आप गेंद या पल से बच सकते हैं' },
  'confidence_effect:negative_thoughts': { dim: 'effect', en: 'negative thoughts can take over', hi: 'नकारात्मक विचार हावी हो सकते हैं' },
  'confidence_effect:body_tense':        { dim: 'effect', en: 'your body can tense up', hi: 'आपका शरीर कस सकता है' },
  // ── motivation ──
  'motivation_when:after_bad_result':    { dim: 'reaction', en: 'a bad result can make training feel harder', hi: 'खराब नतीजे के बाद ट्रेनिंग कठिन लग सकती है' },
  'motivation_when:repetitive_training': { dim: 'reaction', en: 'repetitive training can feel flat', hi: 'एक जैसी ट्रेनिंग फीकी लग सकती है' },
  'motivation_when:no_clear_goal':       { dim: 'reaction', en: 'it dips when a clear goal is missing', hi: 'साफ लक्ष्य न होने पर यह गिरती है' },
  'motivation_effect:skip_or_shorten':   { dim: 'effect', en: 'you may skip or shorten sessions', hi: 'आप सेशन छोड़ या छोटा कर सकते हैं' },
  'motivation_when:tired_or_busy':       { dim: 'reaction', en: 'it dips when you are tired or stretched for time', hi: 'थके या व्यस्त होने पर यह गिरती है' },
  'motivation_when:alone_no_team':       { dim: 'reaction', en: 'training alone can make it harder', hi: 'अकेले ट्रेनिंग करना इसे कठिन बना सकता है' },
  'motivation_when:after_injury':        { dim: 'reaction', en: 'it can dip after an injury', hi: 'चोट के बाद यह गिर सकती है' },
  'motivation_effect:go_through_motions': { dim: 'effect', en: 'you may just go through the motions', hi: 'आप बस निभा सकते हैं' },
  'motivation_effect:lose_focus':        { dim: 'effect', en: 'your focus in training can slip', hi: 'ट्रेनिंग में ध्यान भटक सकता है' },
  'motivation_effect:enjoy_less':        { dim: 'effect', en: 'you may enjoy it less', hi: 'आपको कम मज़ा आ सकता है' },
  // ── coach_selection ──
  'coach_selection_moment:critical_feedback':  { dim: 'reaction', en: 'critical feedback can weigh on you', hi: 'आलोचनात्मक फीडबैक भारी पड़ सकता है' },
  'coach_selection_moment:being_compared':     { dim: 'reaction', en: 'being compared can add pressure', hi: 'तुलना दबाव बढ़ा सकती है' },
  'coach_selection_moment:selection_uncertain':{ dim: 'reaction', en: 'selection uncertainty can sit on your mind', hi: 'सिलेक्शन की अनिश्चितता मन पर रह सकती है' },
  'coach_selection_effect:overthink':          { dim: 'effect', en: 'you may overthink', hi: 'आप ज़्यादा सोच सकते हैं' },
  'coach_selection_effect:play_safe':          { dim: 'effect', en: 'you may play safe', hi: 'आप सुरक्षित खेल सकते हैं' },
  'coach_selection_moment:public_feedback':    { dim: 'reaction', en: 'feedback in front of others can land harder', hi: 'सबके सामने मिला फीडबैक ज़्यादा चुभ सकता है' },
  'coach_selection_moment:unclear_expectations': { dim: 'reaction', en: 'unclear expectations can unsettle you', hi: 'अस्पष्ट उम्मीदें आपको असहज कर सकती हैं' },
  'coach_selection_moment:fear_dropped':       { dim: 'reaction', en: 'the worry of being dropped can stay with you', hi: 'बाहर होने का डर मन में रह सकता है' },
  'coach_selection_effect:try_too_hard':       { dim: 'effect', en: 'you may try too hard', hi: 'आप बहुत ज़ोर लगा सकते हैं' },
  'coach_selection_effect:lose_confidence':    { dim: 'effect', en: 'confidence can drop afterwards', hi: 'बाद में आत्मविश्वास गिर सकता है' },
  'coach_selection_effect:withdraw':           { dim: 'effect', en: 'you may pull back and say less', hi: 'आप पीछे हट सकते हैं और कम बोल सकते हैं' },
  // ── family_outside ──
  'family_outside_effect:extra_pressure':    { dim: 'reaction', en: 'outside expectations can add pressure', hi: 'बाहरी उम्मीदें दबाव बढ़ा सकती हैं' },
  'family_outside_effect:fear_letting_down': { dim: 'reaction', en: 'a fear of letting people down can show up', hi: 'निराश करने का डर आ सकता है' },
  'family_outside_effect:play_safe':         { dim: 'effect', en: 'you may play safe', hi: 'आप सुरक्षित खेल सकते हैं' },
  'family_outside_effect:overthink':         { dim: 'effect', en: 'you may overthink', hi: 'आप ज़्यादा सोच सकते हैं' },
  'family_outside_effect:lose_enjoyment':    { dim: 'effect', en: 'the enjoyment can drain out of it', hi: 'खेल का मज़ा कम हो सकता है' },
  // ── injury ──
  'injury_concern:re_injury_fear':       { dim: 'reaction', en: 'a fear of re-injury can hold you back', hi: 'दोबारा चोट का डर रोक सकता है' },
  'injury_concern:hesitate_in_contests': { dim: 'reaction', en: 'you may hesitate in contests', hi: 'मुक़ाबलों में आप हिचकिचा सकते हैं' },
  'injury_concern:lost_form':            { dim: 'effect', en: 'worry about lost form can linger', hi: 'फॉर्म खोने की चिंता बनी रह सकती है' },
  'injury_concern:frustrated_impatient': { dim: 'reaction', en: 'frustration or impatience can build', hi: 'निराशा या बेसब्री बढ़ सकती है' },
  'injury_concern:lost_fitness':         { dim: 'effect', en: 'worry about lost fitness can sit with you', hi: 'फिटनेस खोने की चिंता बनी रह सकती है' },
  'injury_concern:lost_place':           { dim: 'effect', en: 'worry about losing your place can sit with you', hi: 'टीम में जगह खोने की चिंता बनी रह सकती है' },
  // ── custom (structured neutral follow-ups) ──
  'custom_response:body_tense':       { dim: 'reaction', en: 'your body can tense up', hi: 'आपका शरीर कस सकता है' },
  'custom_response:negative_thoughts':{ dim: 'reaction', en: 'negative thoughts can show up', hi: 'नकारात्मक विचार आ सकते हैं' },
  'custom_response:lose_focus':       { dim: 'reaction', en: 'your focus can slip', hi: 'आपका ध्यान भटक सकता है' },
  'custom_response:hesitate':         { dim: 'reaction', en: 'you may hesitate', hi: 'आप हिचकिचा सकते हैं' },
  'custom_effect:rush':               { dim: 'effect', en: 'you may rush', hi: 'आप जल्दबाज़ी कर सकते हैं' },
  'custom_effect:too_cautious':       { dim: 'effect', en: 'you may play too cautiously', hi: 'आप बहुत सतर्क खेल सकते हैं' },
  'custom_effect:simple_mistakes':    { dim: 'effect', en: 'simple mistakes can creep in', hi: 'आसान गलतियाँ हो सकती हैं' },
  'custom_response:frustrated':       { dim: 'reaction', en: 'frustration can build', hi: 'झुंझलाहट बढ़ सकती है' },
  'custom_effect:hesitate':           { dim: 'effect', en: 'you may hesitate', hi: 'आप हिचकिचा सकते हैं' },
  'custom_effect:lose_focus':         { dim: 'effect', en: 'your focus can slip', hi: 'आपका ध्यान भटक सकता है' },
  // ── unsure recognition ──
  'unsure_recognition:differ_comp_vs_training':{ dim: 'reaction', en: 'you play differently in competition than in training', hi: 'आप मुक़ाबले में ट्रेनिंग से अलग खेलते हैं' },
  'unsure_recognition:one_mistake_snowballs':  { dim: 'reaction', en: 'one mistake can affect several actions after it', hi: 'एक गलती बाद के कई एक्शन पर असर डाल सकती है' },
  'unsure_recognition:hesitate_under_pressure':{ dim: 'reaction', en: 'you can hesitate under pressure even when you know what to do', hi: 'दबाव में आप जानते हुए भी हिचकिचा सकते हैं' },
  'unsure_recognition:focus_leaves_present':   { dim: 'reaction', en: 'your focus can move away from the present moment', hi: 'आपका ध्यान वर्तमान पल से हट सकता है' },
  'unsure_recognition:compare_to_others':      { dim: 'reaction', en: 'you can compare yourself with other athletes', hi: 'आप खुद की दूसरों से तुलना कर सकते हैं' },
  'unsure_recognition:struggle_consistency':   { dim: 'reaction', en: 'training consistently can be a struggle', hi: 'लगातार ट्रेनिंग करना मुश्किल हो सकता है' },
  'unsure_recognition:pressure_to_prove':      { dim: 'reaction', en: 'you can feel pressure to prove yourself', hi: 'खुद को साबित करने का दबाव महसूस हो सकता है' },
};

// When the athlete could not name one situation, the recognition they DID
// pick still names a situation — so §2/§4 stay specific instead of asking
// them to work out which situation matters (onboarding already asked that).
const UNSURE_TRIGGER = {
  differ_comp_vs_training:  { en: 'in competition compared with training', hi: 'ट्रेनिंग के मुकाबले मैच में' },
  one_mistake_snowballs:    { en: 'after a mistake',                       hi: 'गलती के बाद' },
  hesitate_under_pressure:  { en: 'when the pressure is on',               hi: 'जब दबाव होता है' },
  focus_leaves_present:     { en: 'when your focus leaves the present moment', hi: 'जब ध्यान वर्तमान पल से हट जाता है' },
  compare_to_others:        { en: 'when you compare yourself with other athletes', hi: 'जब आप खुद की दूसरों से तुलना करते हैं' },
  struggle_consistency:     { en: 'in training consistently',              hi: 'लगातार ट्रेनिंग करने में' },
  pressure_to_prove:        { en: 'when you feel you have to prove yourself', hi: 'जब खुद को साबित करने का दबाव लगता है' },
};

// Where the pressure first shows up (pre_performance branch) — context, not a
// problem observation.
const ONSET_PHRASE = {
  hours_days_before: { en: 'it can start hours or days before you play', hi: 'यह खेलने से घंटों या दिनों पहले शुरू हो सकता है' },
  on_the_day:        { en: 'it tends to start on the day itself', hi: 'यह आमतौर पर उसी दिन शुरू होता है' },
  during_warmup:     { en: 'it tends to show up during the warm-up', hi: 'यह आमतौर पर वॉर्म-अप के दौरान दिखता है' },
  just_before:       { en: 'it tends to show up just before you perform', hi: 'यह खेलने से ठीक पहले दिखता है' },
  after_start:       { en: 'it tends to show up only once you have started', hi: 'यह शुरू होने के बाद ही दिखता है' },
};

// What stage of injury the athlete is at — context for §1/§2.
const INJURY_STAGE = {
  recovering_not_playing:   { en: 'you are recovering and not playing yet', hi: 'आप ठीक हो रहे हैं और अभी खेल नहीं रहे' },
  returned_building_back:   { en: 'you are back and building up again', hi: 'आप लौट आए हैं और दोबारा तैयारी कर रहे हैं' },
  fully_back_still_worried: { en: 'you are fully back but it is still on your mind', hi: 'आप पूरी तरह लौट आए हैं पर यह अब भी मन में है' },
  recurring_niggles:        { en: 'you are dealing with niggles that keep returning', hi: 'बार-बार लौटने वाली छोटी चोटों से जूझ रहे हैं' },
};

// Where outside expectation is coming from (family_outside branch).
const FAMILY_SOURCE = {
  parents:          { en: 'from your parents', hi: 'माता-पिता की ओर से' },
  relatives:        { en: 'from relatives', hi: 'रिश्तेदारों की ओर से' },
  friends_peers:    { en: 'from friends or team-mates', hi: 'दोस्तों या साथियों की ओर से' },
  school_teachers:  { en: 'from school or teachers', hi: 'स्कूल या शिक्षकों की ओर से' },
  community_public: { en: 'from your community', hi: 'आपके समुदाय की ओर से' },
  social_media:     { en: 'from social media', hi: 'सोशल मीडिया की ओर से' },
};

// Pressures the athlete said sit around their sport (contextual_pressures) —
// previously collected and never used.
const CONTEXT_PHRASE = {
  own_expectations:  { en: 'your own expectations', hi: 'आपकी अपनी उम्मीदें' },
  coach_behaviour:   { en: "your coach's approach", hi: 'आपके कोच का तरीका' },
  family_expectations: { en: 'expectations at home', hi: 'घर की उम्मीदें' },
  comparison:        { en: 'comparison with other athletes', hi: 'दूसरों से तुलना' },
  selection_pressure: { en: 'selection pressure', hi: 'सिलेक्शन का दबाव' },
  school_work:       { en: 'balancing school work', hi: 'पढ़ाई के साथ तालमेल' },
  money_travel:      { en: 'money or travel demands', hi: 'पैसे या सफ़र की मुश्किलें' },
  injury_condition:  { en: 'an injury or physical condition', hi: 'चोट या शारीरिक स्थिति' },
  social_media:      { en: 'social media', hi: 'सोशल मीडिया' },
};

// A short duration clause when recovery is prolonged (added at most once).
// Deliberately has no leading "and" — the clause joiner supplies it.
const DURATION_PROLONGED = { en: 'this can linger for much of the session', hi: 'यह अधिकतर सेशन तक बना रह सकता है' };
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

// Role/position, used in §1 when it adds something concrete.
// `both` is a real answer meaning the athlete plays more than one role — it
// gets a natural combined label rather than being dropped. `none`, `unsure`
// and `different` are deliberately absent: they carry nothing displayable
// (and `different`'s custom text is not part of ruleOutput), so the snapshot
// omits the chip entirely rather than showing an empty or raw value.
const ROLE_LABEL = {
  batter: { en: 'batter', hi: 'बल्लेबाज़' }, bowler: { en: 'bowler', hi: 'गेंदबाज़' },
  all_rounder: { en: 'all-rounder', hi: 'ऑलराउंडर' }, wicketkeeper: { en: 'wicketkeeper', hi: 'विकेटकीपर' },
  goalkeeper: { en: 'goalkeeper', hi: 'गोलकीपर' }, defender: { en: 'defender', hi: 'डिफेंडर' },
  midfielder: { en: 'midfielder', hi: 'मिडफील्डर' }, forward: { en: 'forward', hi: 'फॉरवर्ड' },
  singles: { en: 'singles player', hi: 'सिंगल्स खिलाड़ी' }, doubles: { en: 'doubles player', hi: 'डबल्स खिलाड़ी' },
  both: { en: 'Multiple roles', hi: 'कई भूमिकाएँ' },
};

// When the athlete named no support/strength we can phrase, §3 still stays
// specific to their situation instead of falling back to filler.
const NOTHING_NAMED_YET = {
  en: (trigger) => `You haven't named yet what helps you ${trigger} — that's one of the first things worth noticing together.`,
  hi: (trigger) => `आपने अभी नहीं बताया कि ${trigger} आपकी क्या मदद करता है — साथ में सबसे पहले यही देखने लायक है।`,
};

// ── Custom-answer dim resolution (Performance Pattern single-choice pass) ──
// A "something else" answer to a reaction/effect question has no CLAUSE
// entry (free text isn't a fixed phrase), so buildRuleOutput cannot classify
// it by looking one up. For almost every reaction/effect question every one
// of its OWN predefined answers already shares one dim — so that single dim
// is the obvious, mechanical answer, derived from CLAUSE itself (one source
// of truth, nothing duplicated here).
//
// Two questions are the exception: family_outside_effect and injury_concern
// each mix reaction- and effect-dim predefined answers on one question, so no
// single dim can be derived. Both are the SECOND screen of their branch's
// three-screen arc (source→effect→recovery, stage→concern→recovery) — the
// same structural position every other branch gives a dedicated effect-only
// screen. A custom answer to either is classified 'effect' by that screen
// position, not by reading anything into the athlete's own words.
const CUSTOM_DIM_OVERRIDE = { family_outside_effect: 'effect', injury_concern: 'effect' };
function questionDim(qid) {
  if (CUSTOM_DIM_OVERRIDE[qid]) return CUSTOM_DIM_OVERRIDE[qid];
  const dims = new Set(Object.keys(CLAUSE).filter((k) => k.startsWith(`${qid}:`)).map((k) => CLAUSE[k].dim));
  return dims.size === 1 ? [...dims][0] : null;
}

module.exports = {
  RULE_VERSION, PROHIBITED_PATTERNS, NEUTRAL_ANSWERS, QUICK_RECOVERY, PROLONGED_RECOVERY,
  TRIGGER, BEGIN, CLAUSE, DURATION_PROLONGED, RESILIENCE_NOTE,
  SUPPORT_PHRASE, STRENGTH_PHRASE, GOAL_LABEL, OUTCOME_LABEL, SPORT_LABEL,
  UNSURE_TRIGGER, ONSET_PHRASE, INJURY_STAGE, FAMILY_SOURCE, CONTEXT_PHRASE,
  ROLE_LABEL, NOTHING_NAMED_YET, PRIORITY_PHRASE, PRIORITY_PHRASE_FALLBACK, BEGIN_SEQUENCE,
  FOCUS_ACTION_LABEL, CUSTOM_FOCUS_ID, CUSTOM_FOCUS_FALLBACK_LABEL, LEVEL_LABEL, EXPERIENCE_LABEL,
  questionDim,
};
