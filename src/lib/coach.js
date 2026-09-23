// Voice coach. Plays pre-recorded lines (public/voice/*.mp3, one natural male
// voice) back to back through Web Audio, so they mix over your music like the
// chime does. Anything without a recording falls back to the system voice.
import { CLIP_TEXT, INTRO_DOSE } from '../data/voice-clips.js';
import { audioContext, audioReady } from './device.js';
import * as tts from './voice.js';

const BASE = `${import.meta.env.BASE_URL}voice/`;
const GAP = 0.08; // seconds between clips
const buffers = new Map(); // key → { buffer, start, end } | Promise
let playing = [];
let seq = 0; // newest announcement wins

const has = (key) => key in CLIP_TEXT;
const urlFor = (key) => `${BASE}${key.replace('/', '_')}.mp3`;

// Find where speech starts/ends so joined clips don't have dead air.
function trimBounds(buffer) {
  const data = buffer.getChannelData(0);
  const threshold = 0.012;
  let a = 0;
  let b = data.length - 1;
  while (a < b && Math.abs(data[a]) < threshold) a++;
  while (b > a && Math.abs(data[b]) < threshold) b--;
  const pad = 0.03 * buffer.sampleRate;
  return { start: Math.max(0, a - pad) / buffer.sampleRate, end: Math.min(data.length, b + pad) / buffer.sampleRate };
}

function load(ctx, key) {
  if (!buffers.has(key)) {
    const p = fetch(urlFor(key))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buffer) => {
        const clip = { buffer, ...trimBounds(buffer) };
        buffers.set(key, clip);
        return clip;
      })
      .catch(() => {
        buffers.delete(key);
        return null;
      });
    buffers.set(key, p);
  }
  return Promise.resolve(buffers.get(key));
}

// Warm the cache once audio is unlocked so the first announcement isn't late.
export function preload() {
  const ctx = audioContext();
  if (ctx) for (const key of Object.keys(CLIP_TEXT)) load(ctx, key);
}

export function stop() {
  for (const src of playing) {
    try {
      src.stop();
    } catch {
      /* already stopped */
    }
  }
  playing = [];
  tts.stop();
}

// parts: clip keys. Falls back to speaking `fallbackText` when a clip is missing.
async function play(parts, fallbackText) {
  stop();
  const my = ++seq;
  const ctx = await audioReady();
  if (my !== seq) return;
  if (!ctx || !parts.every(has)) return tts.say(fallbackText);
  const clips = await Promise.all(parts.map((k) => load(ctx, k)));
  if (my !== seq) return;
  if (clips.some((c) => !c)) return tts.say(fallbackText);
  let t = ctx.currentTime + 0.02;
  const mine = [];
  for (const c of clips) {
    const src = ctx.createBufferSource();
    src.buffer = c.buffer;
    src.connect(ctx.destination);
    src.start(t, c.start, c.end - c.start);
    t += c.end - c.start + GAP;
    mine.push(src);
  }
  playing = mine;
}

// ---------- Phrases ----------

// Name + dose clip when the recording still matches the exercise, else just the name.
function introParts(ex) {
  const d = INTRO_DOSE[ex.id];
  const same = d && d.sets === ex.sets && d.reps === ex.reps && (d.repsNote ?? null) === (ex.repsNote ?? null);
  return same ? [`i/${ex.id}`] : [`n/${ex.id}`];
}
const introText = (ex) => `${ex.name}. ${tts.doseText(ex)}.`;

export const coach = {
  start: (ex) => play(['p/lets-go', ...introParts(ex)], `Let's go! First up: ${introText(ex)}`),
  exercise: (ex) => play(['p/next-ex', ...introParts(ex)], `Next exercise: ${introText(ex)}`),
  done: () => play(['p/done'], 'Workout complete. Nice work!'),
  voiceOn: () => play(['p/voice-on'], 'Voice coach on.'),
};
