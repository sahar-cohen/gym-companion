import { state, render } from '../app/state.js';
import { esc, fmtDuration } from '../app/util.js';
import { getViewer } from '../app/viewer.js';
import { muscleName } from '../data/muscles.js';
import { icon } from '../ui/icons.js';
import { forgetStage } from '../ui/technique.js';

// Per-muscle load: primary counts 1 per set, secondary ½.
function muscleLoad(exercises) {
  const load = {};
  for (const e of exercises) {
    const sets = e.sets || 1;
    for (const m of e.primary) load[m] = (load[m] ?? 0) + sets;
    for (const m of e.secondary ?? []) load[m] = (load[m] ?? 0) + sets * 0.5;
  }
  return load;
}

export function renderSummary(app) {
  const r = state.summary;
  const load = muscleLoad(r.exercises);
  const max = Math.max(1, ...Object.values(load));
  const levels = Object.fromEntries(Object.entries(load).map(([m, v]) => [m, 0.25 + 0.75 * (v / max)]));
  const byLoad = Object.keys(load).sort((a, b) => load[b] - load[a]);
  const primary = new Set(r.exercises.flatMap((e) => e.primary));
  const worked = byLoad.filter((m) => primary.has(m));
  const touched = byLoad.filter((m) => !primary.has(m));

  app.innerHTML = `
    <div class="screen done">
      <header class="bar">
        <span class="icon-btn-space"></span>
        <div class="bar-mid"></div>
        <button class="icon-btn" data-action="home" aria-label="Close">${icon.close}</button>
      </header>
      <h1 class="done-title">Nicely done.</h1>
      <p class="page-sub">${esc(r.workoutName)} · ${fmtDuration(r.finishedAt - r.startedAt)} · ${r.exercises.length} of ${r.total} exercises</p>

      <div class="bodymap"><div class="stage-canvas" id="stage-canvas"></div></div>

      ${
        worked.length
          ? `<section class="notes-block"><h3 class="label">Worked</h3>
              <p class="works"><span class="works-primary">${worked.map((m) => esc(muscleName(m))).join(', ')}</span></p></section>`
          : ''
      }
      ${
        touched.length
          ? `<section class="notes-block"><h3 class="label">Also</h3>
              <p class="works"><span class="works-secondary">${touched.map((m) => esc(muscleName(m))).join(', ')}</span></p></section>`
          : ''
      }
      <section class="notes-block"><h3 class="label">Exercises</h3>
        <ol class="done-list">${r.exercises.map((e) => `<li>${esc(e.name)}</li>`).join('')}</ol></section>

      <div class="home-dock"><button class="dock-go" data-action="home"><span class="dock-go-main">Done</span>${icon.check}</button></div>
    </div>`;

  forgetStage(); // the next exercise page must re-show its demo
  const viewer = getViewer();
  viewer.mount(document.getElementById('stage-canvas'));
  viewer.showBodyMap(levels);
  viewer.start();
}

export const summaryActions = {
  home: () => {
    state.summary = null;
    state.screen = 'home';
    render();
  },
};
