// Renders the teaser: every frame of teaser/index.html via headless Chromium,
// the score from audio.mjs, muxed with ffmpeg into out/spot-teaser.mp4.
//
//   node render.mjs                 full render
//   node render.mjs --stills 2.5,6  just those moments, as PNGs in out/stills
//   node render.mjs --from 4 --to 8 a slice (handy while iterating)
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import ffmpeg from 'ffmpeg-static';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cpus } from 'node:os';
import { FPS, DURATION } from './timeline.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(here, 'out');
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const server = await createServer({ root, configFile: false, logLevel: 'error', server: { port: 5199, strictPort: false }, optimizeDeps: { entries: ['teaser/index.html'] } });
await server.listen();
const url = `http://localhost:${server.config.server.port}/teaser/index.html`;

const browser = await chromium.launch({
  executablePath: existsSync(CHROME) ? CHROME : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

async function openPage() {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()));
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  return page;
}

async function shoot(page, t, path) {
  await page.evaluate((t) => window.seek(t), t);
  await page.screenshot({ path, clip: { x: 0, y: 0, width: 960, height: 540 }, type: 'png' });
}

mkdirSync(out, { recursive: true });

if (args.includes('--stills')) {
  const times = (opt('stills') || '0.5,1.6,2.1,2.8,3.55,4.3,4.8,5.3,5.75,6.3,6.8,7.3,8.3,9.6,10.4,11.2,11.8,12.3,13.2,14.5').split(',').map(Number);
  const dir = join(out, 'stills');
  mkdirSync(dir, { recursive: true });
  const page = await openPage();
  for (const t of times) {
    const s = performance.now();
    await shoot(page, t, join(dir, `t${t.toFixed(3)}.png`));
    console.log(`t=${t}  ${(performance.now() - s).toFixed(0)} ms`);
  }
} else {
  const from = Number(opt('from') ?? 0);
  const to = Number(opt('to') ?? DURATION);
  const frames = join(out, 'frames');
  if (!opt('from')) rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const first = Math.round(from * FPS);
  const last = Math.round(to * FPS);
  const workers = Number(opt('workers') ?? Math.max(1, Math.min(4, cpus().length)));
  const pages = await Promise.all(Array.from({ length: workers }, openPage));
  let next = first;
  let done = 0;
  const start = performance.now();
  // Each worker walks frames in order (the scene caches props per shot).
  const chunk = Math.ceil((last - first) / workers);
  await Promise.all(
    pages.map(async (page, w) => {
      const a = first + w * chunk;
      const b = Math.min(last, a + chunk);
      for (let f = a; f < b; f++) {
        await shoot(page, f / FPS, join(frames, `${String(f).padStart(5, '0')}.png`));
        done++;
        if (done % 30 === 0) {
          const el = (performance.now() - start) / 1000;
          console.log(`${done}/${last - first} frames  ${(el / done).toFixed(2)} s/frame  eta ${((el / done) * (last - first - done)).toFixed(0)} s`);
        }
      }
    }),
  );
  void next;
  console.log('frames done');

  if (!opt('from') || args.includes('--mux')) {
    const wav = join(out, 'score.wav');
    spawnSync('node', [join(here, 'audio.mjs'), wav], { stdio: 'inherit' });
    const mp4 = join(out, 'spot-teaser.mp4');
    const r = spawnSync(
      ffmpeg,
      ['-y', '-framerate', String(FPS), '-i', join(frames, '%05d.png'), '-i', wav,
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-tune', 'film',
        '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', mp4],
      { stdio: 'inherit' },
    );
    if (r.status === 0) console.log(`wrote ${mp4}`);
  }
}

await browser.close();
await server.close();
