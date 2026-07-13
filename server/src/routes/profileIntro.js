const express    = require('express');
const Anthropic  = require('@anthropic-ai/sdk');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');
const requireGuardianConsent = require('../middleware/requireGuardianConsent');
const { aiLimiter } = require('../middleware/rateLimits');
const { isTrialActive } = require('./chat');
const { screenSafetyText, recordSafetyEvent } = require('../services/safety');

const router = express.Router();
const prisma = new PrismaClient();

const CHALLENGE_FOCUS = {
  nerves:          { en: 'Staying calm under pressure',       hi: 'दबाव में शांत रहना' },
  failure:         { en: 'Bouncing back from setbacks',       hi: 'असफलता के बाद उठना' },
  focus:           { en: 'Locking in during play',            hi: 'खेल में पूरी तरह केंद्रित रहना' },
  family_pressure: { en: 'Tuning out external pressure',      hi: 'बाहरी दबाव से मुक्त रहना' },
  injury:          { en: 'Returning stronger from injury',    hi: 'चोट के बाद और मजबूत लौटना' },
  consistency:     { en: 'Building consistent performance',   hi: 'लगातार अच्छा प्रदर्शन करना' },
};

const FALLBACKS = {
  nerves: {
    en: "You've taken the first and most important step — recognising that your mind is as trainable as your body. Pre-match nerves affect even the best athletes in the world, and the difference between those who freeze and those who fly is a system, not a talent. Over the coming sessions, Arjun will help you build that system — breath by breath, routine by routine. Your mental game starts right here.",
    hi: "आपने पहला और सबसे जरूरी कदम उठाया है — यह स्वीकार करना कि आपका दिमाग भी उतना ही प्रशिक्षित हो सकता है जितना आपका शरीर। मैच से पहले नर्वसनेस दुनिया के सर्वश्रेष्ठ एथलीटों को भी होती है। अर्जुन आपकी मदद करेगा एक मजबूत प्री-मैच रूटीन बनाने में — सांस दर सांस, कदम दर कदम।",
  },
  failure: {
    en: "Every elite athlete has a chapter in their story that reads like a disaster — the loss that wouldn't leave, the slump that felt permanent. What separates them isn't avoiding those moments; it's learning to process them faster. Arjun will work with you on building the mental resilience that turns your toughest losses into your biggest growth. You're already thinking like a champion by being here.",
    hi: "हर बड़े एथलीट की कहानी में एक ऐसा दौर होता है जो बहुत कठिन लगता था। फर्क यह नहीं कि वे कभी हारे नहीं — फर्क यह है कि उन्होंने हार से जल्दी सीखना सीखा। अर्जुन आपको वही मानसिक लचीलापन बनाने में मदद करेगा जो हर हार को विकास का जरिया बना दे।",
  },
  focus: {
    en: "In sport, a single second of lost focus can undo minutes of good play. But focus isn't a gift — it's a skill you practice, and right now you've already shown you have the self-awareness to know where you need to grow. Arjun will give you specific tools to get into your zone faster and stay there longer, whether it's a training session or the biggest match of your life.",
    hi: "खेल में एक पल की बेध्यानी कई अच्छे मिनटों को बर्बाद कर सकती है। लेकिन फोकस एक तोहफा नहीं — यह एक कौशल है जो अभ्यास से आता है। अर्जुन आपको वे खास तकनीकें देगा जिससे आप जल्दी अपने ज़ोन में पहुंचें और देर तक टिकें।",
  },
  family_pressure: {
    en: "Playing with the weight of others' expectations is one of the hardest mental challenges in sport — especially in India, where family sacrifice and athletic ambition are deeply intertwined. You're not alone in this, and there's a way to honour those relationships while protecting your performance headspace. Arjun will help you find that balance.",
    hi: "दूसरों की उम्मीदों के बोझ के साथ खेलना खेल की सबसे कठिन मानसिक चुनौतियों में से एक है। आप इसमें अकेले नहीं हैं, और ऐसा रास्ता है जिससे आप रिश्तों का सम्मान भी कर सकते हैं और अपने खेल पर भी ध्यान दे सकते हैं। अर्जुन आपको वो संतुलन खोजने में मदद करेगा।",
  },
  injury: {
    en: "Coming back from injury is as much a mental battle as a physical one — the doubt, the overcaution, the fear of re-injury can hold you back even after your body is ready. Arjun will help you rebuild not just your confidence in your body, but the mental toughness to perform without holding back. The comeback starts in your mind.",
    hi: "चोट से वापस आना उतना ही मानसिक जंग है जितना शारीरिक — शक, सावधानी और दोबारा चोट का डर आपको रोक सकता है। अर्जुन आपको सिर्फ आत्मविश्वास ही नहीं बल्कि वह मानसिक मजबूती भी देगा जो पूरी ताकत से खेलने के लिए चाहिए।",
  },
  consistency: {
    en: "Consistency is the rarest and most valuable mental skill in sport — not the big-match heroics, but the ability to show up at your best day after day. It requires systems, not just motivation. You've already taken the first step by identifying this as your focus. Now Arjun will help you build the routines that make consistency your default.",
    hi: "लगातार अच्छा प्रदर्शन खेल में सबसे दुर्लभ और मूल्यवान मानसिक कौशल है। इसके लिए सिर्फ मोटिवेशन नहीं, एक मजबूत प्रणाली चाहिए। अर्जुन आपको वे रूटीन बनाने में मदद करेगा जो आपकी कंसिस्टेंसी को आपका स्वभाव बना दें।",
  },
};

// GET /api/profile-intro — returns (and caches) the user's personalized intro paragraph
router.get('/', authenticate, aiLimiter, requireGuardianConsent, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true, name: true, sport: true, experienceLevel: true,
        primaryChallenge: true, goals: true, language: true, profileIntro: true,
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.profileIntro) {
      return res.json({ intro: user.profileIntro, cached: true });
    }

    const lang      = user.language || 'en';
    const challenge = user.primaryChallenge || 'focus';
    const fallback  = FALLBACKS[challenge]?.[lang] || FALLBACKS.focus.en;

    // Trial gate: expired-trial free users get the static fallback intro (no Claude call, no cache).
    if (!(await isTrialActive(req.userId))) {
      return res.json({ intro: fallback, cached: false });
    }

    // Deterministic pre-LLM safety screen. The only athlete-authored free
    // text this prompt includes is the name (everything else is fixed chip
    // values). A hit here is almost certainly noise, but the rule stands:
    // flagged content never reaches Anthropic. The athlete gets the normal
    // static fallback intro (this surface is a profile blurb, not a
    // disclosure channel, so crisis guidance in the intro slot would be
    // wrong); a structured SafetyEvent (no content) is still recorded.
    const nameScreen = screenSafetyText(user.name || '');
    if (nameScreen.flagged) {
      recordSafetyEvent(req.userId, 'profile_intro', nameScreen.category);
      return res.json({ intro: fallback, cached: false });
    }

    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const sport          = user.sport || 'sport';
      const level          = user.experienceLevel || 'competitive';
      const challengeLabel = CHALLENGE_FOCUS[challenge]?.[lang] || challenge;

      const prompt = lang === 'hi'
        ? `तुम अर्जुन हो — एक भारतीय खेल मनोवैज्ञानिक और मानसिक प्रदर्शन कोच। ${user.name} एक ${level} स्तर का ${sport} खिलाड़ी है जो अभी तुमसे जुड़ा है। उनकी मुख्य चुनौती है: "${challengeLabel}"। एक गर्म, प्रेरणादायक स्वागत पैराग्राफ लिखो — 3-4 वाक्य। कोच की आवाज़ में, डॉक्टर की नहीं। कोई स्कोर या अंक मत दो। सीधे पैराग्राफ लिखो, कोई शीर्षक नहीं।`
        : `You are Arjun — an Indian sports psychologist and mental performance coach. ${user.name} is a ${level} ${sport} player who just started working with you. Their main challenge: "${challengeLabel}". Write a warm, energising welcome paragraph — 3-4 sentences. Coach voice, not clinician. No scores or numbers. Write the paragraph directly, no heading.`;

      const response = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 220,
        messages: [{ role: 'user', content: prompt }],
      });

      const intro = response.content[0]?.text?.trim() || fallback;

      await prisma.user.update({
        where: { id: req.userId },
        data: { profileIntro: intro },
      });

      return res.json({ intro, cached: false });
    } catch {
      return res.json({ intro: fallback, cached: false });
    }
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
