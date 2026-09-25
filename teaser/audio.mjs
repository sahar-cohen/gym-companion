// The score, synthesised from scratch and locked to timeline.js.
// E minor, 120 BPM. Also borrows two lines from the app's recorded coach.
//   node audio.mjs out/score.wav
import ffmpeg from 'ffmpeg-static';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DURATION, BEAT, T } from './timeline.js';

const here = dirname(fileURLToPath(import.meta.url));
const SR = 48000;
const N = Math.ceil(DURATION * SR);
const TAU = Math.PI * 2;

// ---------- Buses (stereo) ----------
const bus = () => [new Float32Array(N), new Float32Array(N)];
const drums = bus();
const music = bus(); // ducked by the kick
const fx = bus();
const verbSend = bus();
const voice = bus();
const duck = new Float32Array(N).fill(1);

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const idx = (t) => Math.round(t * SR);

function add(b, i, l, r = l) {
  if (i < 0 || i >= N) return;
  b[0][i] += l;
  b[1][i] += r;
}

// RBJ biquad; coefficients can be updated per block for sweeps.
class Biquad {
  constructor(type, f, q = 0.707) {
    this.type = type;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.set(f, q);
  }
  set(f, q = this.q) {
    this.q = q;
    const w = (TAU * Math.min(Math.max(f, 20), SR * 0.45)) / SR;
    const cs = Math.cos(w);
    const a = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    if (this.type === 'lp') [b0, b1, b2] = [(1 - cs) / 2, 1 - cs, (1 - cs) / 2];
    else if (this.type === 'hp') [b0, b1, b2] = [(1 + cs) / 2, -(1 + cs), (1 + cs) / 2];
    else [b0, b1, b2] = [a, 0, -a]; // band-pass
    const a0 = 1 + a;
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cs) / a0;
    this.a2 = (1 - a) / a0;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

// ---------- Instruments ----------

function kick(t0, amp = 1, { f0 = 160, f1 = 44, len = 0.45, duckDepth = 0.6 } = {}) {
  const s = idx(t0);
  let ph = 0;
  for (let i = 0; i < len * SR; i++) {
    const t = i / SR;
    const f = f1 + (f0 - f1) * Math.exp(-t * 32);
    ph += (TAU * f) / SR;
    const env = Math.exp(-t * 7.5) * Math.min(1, t * 2000);
    let v = Math.sin(ph) * env;
    if (t < 0.004) v += rnd() * 0.5 * (1 - t / 0.004);
    v = Math.tanh(v * 1.6) * amp * 0.9;
    add(drums, s + i, v);
  }
  // Sidechain: pump everything musical.
  for (let i = 0; i < 0.3 * SR; i++) {
    const t = i / SR;
    const g = 1 - duckDepth * amp * Math.exp(-t * 11);
    if (s + i < N) duck[s + i] = Math.min(duck[s + i], g);
  }
}

function sub(t0, amp = 1, len = 2.2, f0 = 70, f1 = 32) {
  const s = idx(t0);
  let ph = 0;
  for (let i = 0; i < len * SR; i++) {
    const t = i / SR;
    ph += (TAU * (f1 + (f0 - f1) * Math.exp(-t * 3))) / SR;
    const v = Math.tanh(Math.sin(ph) * 2) * Math.exp(-t * (3 / len)) * Math.min(1, t * 500) * amp * 0.6;
    add(drums, s + i, v);
  }
}

function noiseHit(b, t0, { amp = 1, len = 0.2, decay = 20, type = 'hp', f = 6000, q = 0.7, width = 0.3, send = 0 } = {}) {
  const s = idx(t0);
  const fl = new Biquad(type, f, q);
  const fr = new Biquad(type, f, q);
  for (let i = 0; i < len * SR; i++) {
    const t = i / SR;
    const env = Math.exp(-t * decay) * Math.min(1, t * 3000);
    const n = rnd();
    const l = fl.run(n * (1 - width) + rnd() * width) * env * amp;
    const r = fr.run(n * (1 - width) + rnd() * width) * env * amp;
    add(b, s + i, l, r);
    if (send) add(verbSend, s + i, l * send, r * send);
  }
}

const hat = (t, amp = 0.16, open = false) => noiseHit(drums, t, { amp, len: open ? 0.3 : 0.06, decay: open ? 14 : 70, f: 8000, width: 0.6 });

function clap(t0, amp = 0.5, send = 0.35) {
  for (const [d, a] of [[0, 0.6], [0.011, 0.7], [0.022, 1]]) {
    noiseHit(drums, t0 + d, { amp: amp * a, len: 0.25, decay: d < 0.02 ? 90 : 16, type: 'bp', f: 1500, q: 0.9, width: 0.5, send });
  }
}

// Detuned supersaw voice through a decaying low-pass.
function saws(b, t0, notes, { amp = 0.12, len = 0.6, attack = 0.005, decay = 5, cut0 = 5000, cut1 = 500, cutDecay = 9, send = 0.4, spread = 0.012, release = 0.08 } = {}) {
  const s = idx(t0);
  const fl = new Biquad('lp', cut0, 0.9);
  const fr = new Biquad('lp', cut0, 0.9);
  const voices = [];
  for (const m of notes) for (const d of [-1, 0, 1]) voices.push({ f: mtof(m) * (1 + d * spread), ph: Math.abs(rnd()), pan: d * 0.6 });
  const total = (len + release) * SR;
  for (let i = 0; i < total; i++) {
    const t = i / SR;
    if (i % 32 === 0) {
      const c = cut1 + (cut0 - cut1) * Math.exp(-t * cutDecay);
      fl.set(c);
      fr.set(c);
    }
    let env = Math.min(1, t / attack) * Math.exp(-t * decay);
    if (t > len) env *= Math.max(0, 1 - (t - len) / release);
    let l = 0;
    let r = 0;
    for (const v of voices) {
      v.ph = (v.ph + v.f / SR) % 1;
      const x = 2 * v.ph - 1;
      l += x * (0.5 - v.pan * 0.5);
      r += x * (0.5 + v.pan * 0.5);
    }
    l = fl.run(l) * env * amp;
    r = fr.run(r) * env * amp;
    add(b, s + i, l, r);
    add(verbSend, s + i, l * send, r * send);
  }
}

function bassNote(t0, m, len, amp = 0.3) {
  const s = idx(t0);
  const f = mtof(m);
  const lp = new Biquad('lp', 900, 1.2);
  let ph = 0;
  let ph2 = 0;
  for (let i = 0; i < len * SR; i++) {
    const t = i / SR;
    if (i % 32 === 0) lp.set(160 + 900 * Math.exp(-t * 18));
    ph = (ph + f / SR) % 1;
    ph2 = (ph2 + (f * 0.5) / SR) % 1;
    const env = Math.min(1, t * 400) * Math.min(1, (len - t) * 200) * (0.7 + 0.3 * Math.exp(-t * 10));
    const v = (lp.run(2 * ph - 1) * 0.8 + Math.sin(TAU * ph2) * 0.55) * env * amp;
    add(music, s + i, v);
  }
}

function sine(b, t0, f, { amp = 0.2, len = 0.3, decay = 12, send = 0.3, pan = 0, glide = 0 } = {}) {
  const s = idx(t0);
  let ph = 0;
  for (let i = 0; i < len * SR; i++) {
    const t = i / SR;
    ph += (TAU * f * (1 + glide * Math.exp(-t * 30))) / SR;
    const v = Math.sin(ph) * Math.exp(-t * decay) * Math.min(1, t * 2000) * amp;
    add(b, s + i, v * (1 - pan), v * (1 + pan));
    add(verbSend, s + i, v * send, v * send);
  }
}

// Filtered-noise sweep; dir > 0 rises. shape: amplitude curve power.
function sweep(t0, t1, { f0 = 300, f1 = 9000, amp = 0.3, q = 2.5, shape = 2, send = 0.5, fadeOut = 0.01 } = {}) {
  const s = idx(t0);
  const len = (t1 - t0) * SR;
  const fl = new Biquad('bp', f0, q);
  const fr = new Biquad('bp', f0, q);
  for (let i = 0; i < len; i++) {
    const u = i / len;
    if (i % 32 === 0) {
      const f = f0 * (f1 / f0) ** u;
      fl.set(f, q);
      fr.set(f, q);
    }
    const tail = Math.min(1, ((1 - u) * (t1 - t0)) / fadeOut);
    const env = u ** shape * tail * amp;
    const l = fl.run(rnd()) * env;
    const r = fr.run(rnd()) * env;
    add(fx, s + i, l, r);
    add(verbSend, s + i, l * send, r * send);
  }
}

// Short "whoosh" for hard cuts: fast down-sweep.
const whoosh = (t, amp = 0.28) => sweep(t - 0.12, t + 0.02, { f0: 900, f1: 5500, amp, q: 1.2, shape: 1.6, send: 0.15, fadeOut: 0.015 });

// ---------- Reverb (Freeverb-ish) ----------

function reverb(inp, { room = 0.86, damp = 0.35, wet = 0.9 } = {}) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const aps = [556, 441, 341, 225];
  const out = bus();
  for (let ch = 0; ch < 2; ch++) {
    const sp = ch * 23;
    const cb = combs.map((d) => ({ buf: new Float32Array(Math.round((d + sp) * (SR / 44100))), i: 0, lp: 0 }));
    const ab = aps.map((d) => ({ buf: new Float32Array(Math.round((d + sp) * (SR / 44100))), i: 0 }));
    const x = inp[ch];
    const y = out[ch];
    for (let n = 0; n < N; n++) {
      const v = x[n] * 0.015;
      let s = 0;
      for (const c of cb) {
        const o = c.buf[c.i];
        c.lp = o * (1 - damp) + c.lp * damp;
        c.buf[c.i] = v + c.lp * room;
        c.i = (c.i + 1) % c.buf.length;
        s += o;
      }
      for (const a of ab) {
        const o = a.buf[a.i];
        a.buf[a.i] = s + o * 0.5;
        a.i = (a.i + 1) % a.buf.length;
        s = o - s;
      }
      y[n] = s * wet;
    }
  }
  return out;
}

// ---------- Voice (the app's own coach clips) ----------

function decode(file) {
  const r = spawnSync(ffmpeg, ['-loglevel', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 28 });
  const b = r.stdout;
  return new Float32Array(b.buffer, b.byteOffset, b.length / 4);
}

// Split a clip into phrases at silences longer than `gap` seconds.
function phrases(x, gap = 0.16) {
  const win = Math.round(SR * 0.01);
  const on = [];
  for (let i = 0; i < x.length; i += win) {
    let e = 0;
    for (let j = i; j < Math.min(x.length, i + win); j++) e += x[j] * x[j];
    on.push(Math.sqrt(e / win) > 0.012);
  }
  const out = [];
  let start = -1;
  let quiet = 0;
  on.forEach((v, k) => {
    if (v) {
      if (start < 0) start = k;
      quiet = 0;
    } else if (start >= 0 && ++quiet * 0.01 > gap) {
      out.push([start * win, (k - quiet + 1) * win]);
      start = -1;
      quiet = 0;
    }
  });
  if (start >= 0) out.push([start * win, x.length]);
  return out;
}

function placeVoice(x, [a, b], t0, gain = 1) {
  const s = idx(t0);
  const pad = Math.round(0.03 * SR);
  a = Math.max(0, a - pad);
  b = Math.min(x.length, b + pad * 2);
  const hp = new Biquad('hp', 90);
  for (let i = a; i < b; i++) {
    const fade = Math.min(1, (i - a) / (0.01 * SR), (b - i) / (0.03 * SR));
    const v = hp.run(x[i]) * fade * gain;
    add(voice, s + i - a, v);
    add(verbSend, s + i - a, v * 0.12, v * 0.12);
  }
  // Duck the music under the voice.
  for (let i = s - 0.05 * SR; i < s + (b - a) + 0.2 * SR; i++) if (i >= 0 && i < N) duck[i] = Math.min(duck[i], 0.55);
}

// ---------- Arrangement ----------

const E = 40; // E2
const chords = {
  Em: [52, 55, 59, 62, 66], // E G B D F#
  Cmaj7: [48, 55, 59, 64, 67],
  D6: [50, 54, 57, 59, 66],
  Em9: [40, 52, 55, 59, 62, 66],
  Cmaj9: [36, 48, 52, 55, 59, 62],
};

// Act 1: silence, a pop, heartbeat, sonar, charge.
sine(fx, T.dotPop, 1320, { amp: 0.16, len: 1.2, decay: 5, send: 0.9, glide: 0.5 });
kick(T.dotPop, 0.55, { f0: 120, f1: 40, len: 0.35 });
T.pulses.forEach((p, i) => {
  kick(p, 0.8, { f0: 110, f1: 38, len: 0.4 });
  kick(p + 0.2, 0.45, { f0: 100, f1: 36, len: 0.3 });
  sine(fx, p, 1320 * (1 + i * 0.125), { amp: 0.07, len: 1.2, decay: 4, send: 1.0 });
});
saws(music, 0.25, [40, 47], { amp: 0.05, len: 1.75, attack: 0.9, decay: 0.2, cut0: 350, cut1: 1800, cutDecay: 0.7, send: 0.5 });
sweep(T.charge[0], T.burst, { f0: 250, f1: 9000, amp: 0.34, q: 3, shape: 2.4, send: 0.6 });
sweep(T.charge[0] + 0.3, T.burst, { f0: 120, f1: 1400, amp: 0.2, q: 6, shape: 3, send: 0.2 });
// Reverse swell into the drop (noise swelling up, cut dead on 2.0).
noiseHit(fx, T.burst - 0.001, { amp: 0 }); // (placeholder keeps rnd sequence stable)
for (let i = 0; i < 0.5 * SR; i++) {
  const u = i / (0.5 * SR);
  add(fx, idx(T.burst - 0.5) + i, rnd() * 0.25 * u ** 4, rnd() * 0.25 * u ** 4);
}

// Act 2 + 3: the groove, 2.0 → 7.875.
sub(T.burst, 1.1, 2.4);
noiseHit(drums, T.burst, { amp: 0.3, len: 1.8, decay: 2.6, f: 3500, width: 0.8, send: 0.6 });
saws(music, T.burst, chords.Em9, { amp: 0.11, len: 0.8, decay: 1.6, cut0: 7000, cut1: 700, cutDecay: 4, send: 0.8 });
for (let b = 0; b < 12; b++) {
  const t = T.burst + b * BEAT;
  if (t >= T.stutter) break;
  kick(t, 1);
  if (b % 2 === 1) clap(t, 0.42);
  hat(t + BEAT / 2, 0.2);
  if (t >= T.montage) {
    hat(t + BEAT / 4, 0.09);
    hat(t + (3 * BEAT) / 4, 0.1);
  }
}
hat(T.squatPeak, 0.18, true);
// Bass: eighths, root with octave pops, following Em | Cmaj7 | D.
const roots = [[2.0, E], [4.0, 36], [6.0, 38]];
for (const [t0, r] of roots) {
  for (let k = 0; k < 8; k++) {
    const t = t0 + k * 0.25;
    if (t >= T.stutter) break;
    const m = k % 4 === 3 ? r + 12 : r;
    bassNote(t, m, 0.22, 0.28);
  }
}
// Montage: a whoosh into and a stab on every cut; top-of-rep ping.
T.cuts.forEach((t, i) => {
  whoosh(t, 0.22);
  const ch = i < 2 ? chords.Em : i < 4 ? chords.Cmaj7 : chords.D6;
  saws(music, t, ch, { amp: 0.085, len: 0.22, decay: 7, cut0: 6500, cut1: 600, cutDecay: 14, send: 0.45 });
  sine(fx, t + 0.26, mtof(88 + [0, 3, 7, 5, 10, 12][i]), { amp: 0.06, len: 0.5, decay: 9, send: 0.6, pan: i % 2 ? 0.4 : -0.4 });
});
// Stutter: snare roll, rising, 16ths then 32nds, into a 16th of silence.
for (let k = 0; k < 14; k++) {
  const t = T.stutter + (k < 6 ? k * 0.125 : 0.75 + (k - 6) * 0.0156);
  if (t >= T.gap) break;
  const u = (t - T.stutter) / (T.gap - T.stutter);
  noiseHit(drums, t, { amp: 0.18 + 0.3 * u, len: 0.12, decay: 30, type: 'bp', f: 1800 + 2600 * u, q: 1.1, width: 0.5, send: 0.2 });
  sine(drums, t, 180 + 220 * u, { amp: 0.14, len: 0.08, decay: 40, send: 0 });
}
for (let k = 0; k < 8; k++) kick(T.stutter + k * 0.125, 0.55 + k * 0.03, { f0: 140, f1: 50, len: 0.14 });
bassNote(T.stutter, 38, 0.8, 0.3);
sweep(T.stutter, T.gap, { f0: 400, f1: 12000, amp: 0.3, q: 2, shape: 2, send: 0.4, fadeOut: 0.005 });
saws(music, T.stutter, [62, 66, 69], { amp: 0.05, len: 0.86, attack: 0.8, decay: 0, cut0: 800, cut1: 800, cutDecay: 0, send: 0.2, release: 0.01 });

// Act 4: the drop to half-time.
kick(T.slowmo, 1.1, { len: 0.8 });
sub(T.slowmo, 1.2, 3.0, 80, 30);
noiseHit(drums, T.slowmo, { amp: 0.34, len: 2.5, decay: 1.8, f: 3000, width: 0.9, send: 0.8 });
saws(music, T.slowmo, chords.Em9, { amp: 0.07, len: 3.4, attack: 0.02, decay: 0.25, cut0: 4200, cut1: 900, cutDecay: 1.4, send: 1.0, spread: 0.018, release: 0.3 });
kick(T.slowmo + 1.5, 0.8, { len: 0.6 });
clap(T.slowmo + 1.0, 0.5, 0.9);
kick(T.slowmo + 2.0, 0.9, { len: 0.6 });
clap(T.slowmo + 3.0, 0.5, 0.9);
for (const [t, m, l] of [[8.0, E, 1.4], [9.5, 43, 0.5], [10.0, 36, 1.0], [11.0, 38, 0.5]]) bassNote(t, m, l, 0.3);
for (let k = 0; k < 12; k++) hat(T.slowmo + 0.25 + k * 0.25, 0.05 + (k % 2) * 0.03);
// Spot rings snapping on: bright blips; cues: typing ticks.
T.rings.forEach((t, i) => {
  sine(fx, t, mtof(91 + [0, 4, 7][i]), { amp: 0.11, len: 0.6, decay: 10, send: 0.7, pan: 0.4 });
  sine(fx, t + 0.05, mtof(103 + [0, 4, 7][i]), { amp: 0.04, len: 0.4, decay: 14, send: 0.7, pan: 0.4 });
});
const CUE_LEN = [22, 23, 23];
T.cues.forEach((t, i) => {
  for (let c = 0; c < CUE_LEN[i]; c += 1) {
    if (c % 2) continue;
    noiseHit(fx, t + c / 34, { amp: 0.07, len: 0.02, decay: 250, type: 'bp', f: 3200 + (c % 5) * 400, q: 2, width: 0.2, send: 0.05 });
  }
});
// Build into the dolly and the blowout.
sweep(10.2, T.iris[0], { f0: 200, f1: 14000, amp: 0.36, q: 2.2, shape: 2.6, send: 0.6, fadeOut: 0.01 });
sine(fx, 10.4, 110, { amp: 0.0, len: 0.01 });
for (let i = 0; i < 1.1 * SR; i++) {
  // Rising sine "tension" tone.
  const t = i / SR;
  const f = 220 * 2 ** (t * 2.2);
  const v = Math.sin(TAU * 220 * ((2 ** (t * 2.2) - 1) / (2.2 * Math.LN2))) * 0.05 * (t / 1.1) ** 2;
  void f;
  add(fx, idx(10.4) + i, v, v);
}
kick(T.slowPeak, 0.8, { len: 0.5 });

// Act 5: the iris closes (a suck-in), the dot lands.
for (let i = 0; i < 0.5 * SR; i++) {
  const u = i / (0.5 * SR);
  const v = rnd() * 0.3 * u ** 5;
  add(fx, idx(T.iris[0]) + i, v, rnd() * 0.3 * u ** 5);
}
sweep(T.iris[0], T.impact, { f0: 6000, f1: 300, amp: 0.22, q: 1.5, shape: 3, send: 0.3, fadeOut: 0.004 });
kick(T.impact, 1.2, { f0: 180, f1: 42, len: 1.0, duckDepth: 0 });
sub(T.impact, 1.3, 3.0, 90, 33);
noiseHit(drums, T.impact, { amp: 0.3, len: 3.0, decay: 1.3, f: 2500, width: 0.9, send: 0.9 });
saws(music, T.impact, chords.Cmaj9, { amp: 0.1, len: 2.6, attack: 0.004, decay: 0.55, cut0: 8000, cut1: 1200, cutDecay: 2.2, send: 1.1, spread: 0.014, release: 0.4 });
// Letters: a little pluck arpeggio as each one pops up.
[76, 79, 83, 86].forEach((m, i) => sine(fx, T.impact + 0.12 + i * 0.06, mtof(m), { amp: 0.09, len: 0.7, decay: 7, send: 0.7, pan: -0.3 + i * 0.2 }));
sine(fx, T.impact + 0.62, mtof(88), { amp: 0.1, len: 1.4, decay: 3, send: 1.0 }); // the dot clicks into place
noiseHit(fx, T.impact + 0.62, { amp: 0.25, len: 0.03, decay: 200, type: 'bp', f: 4000, q: 1.5, width: 0.2 });
// Tagline: a soft shimmer.
[88, 91, 95].forEach((m, i) => sine(fx, T.tagline + i * 0.09, mtof(m), { amp: 0.035, len: 1.5, decay: 2.5, send: 1.2 }));
// Final heartbeat.
kick(T.heartbeat, 0.7, { f0: 100, f1: 38, len: 0.45, duckDepth: 0 });
kick(T.heartbeat + 0.28, 0.45, { f0: 95, f1: 36, len: 0.4, duckDepth: 0 });
saws(music, 13.6, [36, 43, 52], { amp: 0.04, len: 1.4, attack: 0.5, decay: 0.2, cut0: 700, cut1: 700, cutDecay: 0, send: 1.0, release: 0.01 });

// Coach.
const vDir = join(here, '..', 'public', 'voice');
const letsGo = decode(join(vDir, 'p_lets-go.mp3'));
const lp = phrases(letsGo);
placeVoice(letsGo, [lp[0][0], lp[0][1]], T.reveal + 0.05, 0.95);
const done = decode(join(vDir, 'p_done.mp3'));
const dp = phrases(done, 0.07);
placeVoice(done, dp[dp.length - 1], 13.1, 0.9);
console.log(`voice phrases: lets-go ${lp.map(([a, b]) => ((b - a) / SR).toFixed(2))}, done ${dp.map(([a, b]) => ((b - a) / SR).toFixed(2))}`);

// ---------- Mix ----------

// Smooth the duck envelope a touch so the pump doesn't click.
let d = 1;
for (let i = 0; i < N; i++) {
  d += (duck[i] - d) * (duck[i] < d ? 0.02 : 0.0015);
  duck[i] = d;
}
for (let i = 0; i < N; i++) {
  add(verbSend, i, music[0][i] * 0.2, music[1][i] * 0.2);
}
const verb = reverb(verbSend);
const out = bus();
for (let ch = 0; ch < 2; ch++) {
  for (let i = 0; i < N; i++) {
    const m = drums[ch][i] * 0.95 + music[ch][i] * duck[i] * 1.0 + fx[ch][i] * 0.9 + verb[ch][i] * 0.55 * (0.5 + 0.5 * duck[i]) + voice[ch][i] * 1.25;
    out[ch][i] = m;
  }
}
// Glue: gentle saturation, then peak-normalise to -1 dBFS; fade the last 0.35 s.
let peak = 0;
for (let ch = 0; ch < 2; ch++) for (let i = 0; i < N; i++) {
  out[ch][i] = Math.tanh(out[ch][i] * 1.2) / Math.tanh(1.2);
  peak = Math.max(peak, Math.abs(out[ch][i]));
}
const g = 0.62 / peak;
const fadeStart = (DURATION - 0.35) * SR;
const pcm = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  const f = i > fadeStart ? 1 - (i - fadeStart) / (N - fadeStart) : 1;
  for (let ch = 0; ch < 2; ch++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[ch][i] * g * f)) * 32767), (i * 2 + ch) * 2);
}
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write('WAVEfmt ', 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(pcm.length, 40);
const file = process.argv[2] || join(here, 'out', 'score.wav');
writeFileSync(file, Buffer.concat([header, pcm]));
console.log(`wrote ${file}  (peak before norm ${peak.toFixed(2)})`);
