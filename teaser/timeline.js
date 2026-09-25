// Shared by the picture (teaser.js) and the score (audio.mjs) so every cut,
// hit and whoosh lands on the same frame.
export const FPS = 60;
export const DURATION = 15;
export const BPM = 120;
export const BEAT = 60 / BPM; // 0.5 s

export const T = {
  dotPop: 0.25,
  pulses: [0.5, 1.0, 1.5],
  charge: [1.0, 2.0],
  burst: 2.0, // the drop: dot explodes into spots
  reveal: 2.4, // figure materialises around the spots
  squatPeak: 3.5,
  montage: 4.0, // hard cuts every beat
  cuts: [4.0, 4.5, 5.0, 5.5, 6.0, 6.5],
  stutter: 7.0, // 1/8-beat cuts
  gap: 7.875, // white frame, one 16th of silence
  slowmo: 8.0, // half-time
  rings: [8.5, 9.0, 9.5],
  cues: [8.6, 9.3, 10.0],
  slowPeak: 11.0,
  dolly: [10.7, 11.5], // push into the glowing quad
  iris: [11.5, 12.0], // orange closes to a single dot
  impact: 12.0, // dot lands, "Spot." resolves
  tagline: 12.75,
  heartbeat: 14.0,
};
