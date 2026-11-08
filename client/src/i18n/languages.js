// Product decision (Nov 2026): Arjun is English-first for India. Coach
// understands and answers Hinglish, but the app's screens are English only.
//
// Hindi is switched OFF, not deleted: every Hindi string stays in
// translations.js. With this false, the language toggles are hidden, the
// app always renders English, and an account still set to Hindi is moved
// back to English on its next load. Set it to true to bring Hindi back.
export const HINDI_ENABLED = false;
