// Voice coach via speechSynthesis. iOS only speaks after a user gesture has
// spoken once, so prime() runs on the first tap.
const synth = window.speechSynthesis;
let voice = null;
let primed = false;

function pickVoice() {
  const voices = synth?.getVoices() ?? [];
  const en = voices.filter((v) => /^en[-_]/i.test(v.lang));
  // Fallback only (recorded clips are preferred): pick a male voice if one exists.
  voice =
    en.find((v) => /Daniel|Aaron|Arthur|Evan|Nathan|Tom|Reed|Oliver|Alex|Fred|Gordon|Male/i.test(v.name)) ??
    en.find((v) => v.default) ??
    en[0] ??
    null;
}
if (synth) {
  pickVoice();
  synth.addEventListener?.('voiceschanged', pickVoice);
}

export const voiceSupported = !!synth;

export function prime() {
  if (!synth || primed) return;
  primed = true;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  synth.speak(u);
}
window.addEventListener('pointerdown', prime, { once: true, passive: true });

export function say(text, { interrupt = true } = {}) {
  if (!synth || !text) return;
  if (interrupt) synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? 'en-US';
  u.rate = 1.04;
  synth.speak(u);
}

export function stop() {
  synth?.cancel();
}

// Speech-friendly exercise description: "3 sets of 12, per leg".
export function doseText(ex) {
  const reps = String(ex.reps).replace('–', ' to ').replace(/(\d+) s\b/, '$1 seconds');
  return `${ex.sets} sets of ${reps}${ex.repsNote ? `, ${ex.repsNote}` : ''}`;
}
