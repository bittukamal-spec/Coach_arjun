// Optional sound + vibration cues for guided breathing, so an athlete can
// breathe with eyes closed instead of watching the screen.
//
// Off by default and only ever switched on by the athlete (a phone that
// suddenly beeps in a dressing room is worse than no cue). One soft rising
// tone + one buzz for "breathe in", one falling tone + two buzzes for
// "breathe out". Every browser call is guarded: where Web Audio or
// vibration is missing (e.g. vibration on iPhone) that half simply does
// nothing.

const STORAGE_KEY = 'arjun_reset_cues';

export function cuesPreferred() {
  try { return localStorage.getItem(STORAGE_KEY) === 'on'; } catch { return false; }
}

export function rememberCues(on) {
  try { localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
}

export function createBreathCues() {
  let ctx = null;

  function ensureAudio() {
    if (ctx) return ctx;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (Ctor) ctx = new Ctor();
    } catch { ctx = null; }
    return ctx;
  }

  function tone(from, to, seconds) {
    const audio = ensureAudio();
    if (!audio) return;
    try {
      if (audio.state === 'suspended') audio.resume();
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      const now = audio.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(from, now);
      osc.frequency.linearRampToValueAtTime(to, now + seconds);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.08);
      gain.gain.linearRampToValueAtTime(0.0001, now + seconds);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(now);
      osc.stop(now + seconds + 0.05);
    } catch { /* audio unavailable */ }
  }

  function buzz(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* unsupported */ }
  }

  return {
    // Call from a tap so the browser allows audio to start.
    unlock() { ensureAudio(); },
    cue(phase) {
      if (phase === 'inhale') { tone(330, 494, 0.6); buzz(70); }
      else { tone(494, 330, 0.6); buzz([70, 90, 70]); }
    },
    close() {
      try { ctx?.close(); } catch { /* already closed */ }
      ctx = null;
    },
  };
}
