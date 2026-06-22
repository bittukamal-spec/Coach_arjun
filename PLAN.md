# Chat UX Improvements — Implementation Plan

## Research summary
- `showIntro` banner (ChatPage line 117, 430–442): one-time dismissable card with `t.aiIntroTitle` / `t.aiIntroBody` — looks like a system notice, not Arjun speaking
- Empty state (lines 444–467): shows "What do you want to work on today?" + hint to use the dropdown
- Session picker: a `ChevronDown` dropdown (`showSessionPicker`) with 6 session types
- `needsSession = !activeSession && !hasMessages` → input is currently **disabled** until a session is chosen
- `__SESSION:key__` marker: sent as invisible user message; server clears it & appends synthetic opener for Claude; assistant response IS saved to DB with sessionType = null (not stored)
- `arjunMsgCountRef.current`: incremented per Arjun reply (line 254), reset on session change
- `buildSystemPrompt` Coaching Style block: "2–4 short paragraphs" + "Ask a follow-up question" — no hard "one question only" rule
- No `sessionType` column on `Message` model today

---

## Step 0 — Fix the welcome message

**Problem:** The `showIntro` banner is a dismissable card that feels like a system notice, not Arjun's voice. The empty state shows a generic "Select a topic" prompt.

**Fix:**
- Remove `showIntro` state + localStorage check entirely
- When `!hasMessages && !loading && !waitingForFirst`, render a synthetic Arjun chat bubble (styled exactly like assistant `MessageBubble`) with the welcome text
- The bubble includes the AI-disclosure inline ("I'm an AI, not a therapist")
- New translation keys: `arjunWelcome` (en + hi) — replaces `aiIntroTitle/Body/Dismiss`

---

## Step 1 — Conversation starter cards

**4 starters** (map to existing session types):
| Label (EN) | Label (HI) | sessionType |
|---|---|---|
| Before my match | मैच से पहले | `match_prep` |
| Had a tough game | मुश्किल मैच था | `post_match` |
| Feeling nervous | नर्वस हूं | `handle_pressure` |
| Just want to talk | बस बात करनी है | `open` |

**UI:** 2×2 grid of pill/card buttons below the Arjun welcome bubble, shown only when `!hasMessages && !activeSession && !waitingForFirst`

**Behaviour:** tap → calls existing `handleSessionSelect(key)` which sends `__SESSION:key__` → Arjun replies with session-appropriate opening → cards disappear

**Input change:** Remove `disabled` when `needsSession`; placeholder text changes to "Or type what's on your mind…" so user can also type freely without tapping a starter.

**Translation additions:** `starters` object with `{ match_prep, post_match, handle_pressure, open }` in both languages.

---

## Step 2 — Session-labelled history

### Schema
Add `sessionType String?` to `Message` model in `schema.prisma`.

### Backend (`chat.js`)
1. `/messages` GET: add `sessionType: true` to select
2. `/message` POST:
   - Accept `arjunMsgCount` from body
   - When `isSessionStart`: **clear `conversationHistory` before appending the opener** (fresh context per session — memories + check-ins via `buildSystemPrompt` still apply)
   - Save `sessionType` on **user messages** and **assistant messages** (both get `sessionType` = current session)

### Frontend (`ChatPage.jsx`)
- Accept `sessionType` in messages returned from API (already a field after schema change)
- Add `SessionDivider` sub-component: renders `── 🧘 Before a match · 2 days ago ──`
- In the message list map: when `msg.sessionType !== messages[i-1]?.sessionType` AND `msg.sessionType != null`, insert the divider before the message
- Add `timeAgo(date)` helper (today/yesterday/N days ago)
- Pass `arjunMsgCount: arjunMsgCountRef.current` in the `sendMessage` request body

---

## Step 3 — Reply style tightening

Edit the **Coaching Style** bullet block in `buildSystemPrompt` (lines 278–287 of `chat.js`):
- Change: "2–4 short paragraphs" → "Keep replies **short and scannable** — 2–3 sentences maximum. No walls of text."
- Change: "Ask a follow-up question" → "Ask **at most one** follow-up question per reply — never stack multiple questions."
- Add: "Maintain a warm, direct coach tone — conversational, not clinical — across all session types."

---

## Step 4 — Action bridge

When `arjunMsgCount >= 4`, append an `## Action Bridge` block to the system prompt (assembled in `buildSystemPrompt` via `extra.arjunMsgCount`):

> "You are {N} responses into this session. If you've addressed the athlete's main concern, naturally offer ONE specific next step they can try right now — such as a 2-minute breathing drill, a quick ritual step, or a visualisation exercise. One casual sentence, e.g. 'Want to try a quick breathing exercise right now?' Only offer this once per session — do not repeat if you've already suggested it."

---

## Files changed (summary)

| File | Change |
|---|---|
| `server/prisma/schema.prisma` | Add `sessionType String?` to Message |
| `server/src/routes/chat.js` | Style instructions, action bridge, sessionType save, session-history clearing, arjunMsgCount support |
| `client/src/pages/ChatPage.jsx` | Remove banner, add welcome bubble + starters, session dividers, pass arjunMsgCount |
| `client/src/i18n/translations.js` | Replace aiIntro* keys, add starters + arjunWelcome (en + hi) |

Build check: `cd client && npm run build` after all changes.
