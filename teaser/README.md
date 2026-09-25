# Spot. — 15 s teaser

A motion-graphics teaser for the app, rendered from code: the real 3D mannequin,
animations and props from `src/three/`, the brand's type and colours, and a score
synthesised from scratch (plus two lines from the app's recorded coach).

1920×1080, 60 fps, 15 s, with sound: [`spot-teaser.mp4`](spot-teaser.mp4) (a render writes a higher-bitrate master to `teaser/out/spot-teaser.mp4`).

## Structure

| Time | Act |
|---|---|
| 0–2 s | One orange spot on black: a heartbeat, sonar pings, energy converging |
| 2–4 s | It bursts into spots that fly to the muscles; the figure appears around them; FORM |
| 4–8 s | Hard cuts on the beat: EVERY / REP. / EVERY / ANGLE. / EVERY / MUSCLE., then a 1/8-beat stutter |
| 8–11.5 s | Half-time slow-mo squat under a spotlight; muscles spotted, real form cues typed on; dolly into the quad |
| 11.5–15 s | Orange irises down to one dot, which lands and becomes the full stop in **Spot.** — "Every rep, spotted." |

## Files

- `timeline.js` shared timings, so picture and sound hit the same frames
- `index.html`, `teaser.css`, `teaser.js` the scene; `window.seek(t)` draws the frame at `t`
  (3D motion blur from sub-frame accumulation, sub-pixel jitter for anti-aliasing, a bloom that only catches the orange muscles)
- `audio.mjs` the score (E minor, 120 BPM): kick, claps, hats, sidechained bass, stabs, risers, reverb
- `render.mjs` drives headless Chromium frame by frame and muxes with ffmpeg

## Render

```bash
npm install            # in the repo root (three, fonts, vite)
cd teaser && npm install
npm run render         # ~15 min on 4 CPU cores (software WebGL)
npm run stills         # a contact set of stills in out/stills
```

Preview live in the browser with `npm run dev` (repo root) and open
`/teaser/index.html?play` (or `?t=12.5` for one frame).
