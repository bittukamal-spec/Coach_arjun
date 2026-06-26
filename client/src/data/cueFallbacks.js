// Hardcoded fallback cue words shown while AI generates options.
// Keyed by sport then arousal state.
export const cueFallbacks = {
  cricket: {
    calm_down: ['SETTLE', 'EASY', 'TRUST', 'CALM', 'STEADY'],
    lock_in:   ['WATCH', 'HERE', 'SHARP', 'FOCUS', 'PRESENT'],
    fire_up:   ['ATTACK', 'GO', 'COME ON', 'FIRE', 'NOW'],
  },
  football: {
    calm_down: ['CALM', 'READY', 'BREATHE', 'TRUST', 'STEADY'],
    lock_in:   ['HERE', 'SEE IT', 'FOCUS', 'SHARP', 'PRESENT'],
    fire_up:   ['PRESS', 'GO', 'ATTACK', 'NOW', 'FIRE'],
  },
  badminton: {
    calm_down: ['CALM', 'LIGHT', 'TRUST', 'STEADY', 'EASY'],
    lock_in:   ['TRACK', 'HERE', 'SHARP', 'FOCUS', 'WATCH'],
    fire_up:   ['MOVE', 'GO', 'ATTACK', 'FAST', 'FIRE'],
  },
  tennis: {
    calm_down: ['CALM', 'BREATHE', 'TRUST', 'STEADY', 'EASY'],
    lock_in:   ['WATCH', 'HERE', 'FOCUS', 'SHARP', 'BALL'],
    fire_up:   ['FIGHT', 'GO', 'ATTACK', 'NOW', 'FIRE'],
  },
  swimming: {
    calm_down: ['FLOW', 'CALM', 'SMOOTH', 'TRUST', 'EASY'],
    lock_in:   ['RHYTHM', 'HERE', 'FOCUS', 'SHARP', 'GLIDE'],
    fire_up:   ['DRIVE', 'GO', 'POWER', 'FIRE', 'NOW'],
  },
  default: {
    calm_down: ['CALM', 'BREATHE', 'TRUST', 'STEADY', 'READY'],
    lock_in:   ['HERE', 'FOCUS', 'SHARP', 'PRESENT', 'LOCK'],
    fire_up:   ['GO', 'NOW', 'ATTACK', 'FIRE', 'RISE'],
  },
};
