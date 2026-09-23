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
  const ranked = Object.entries(load).sort((a, b) => b[1] - a[1]);
  const setsText = (v) => `${Number.isInteger(v) ? v : v.toFixed(1)} set${v === 1 ? '' : 's'}`;

  app.innerHTML = `
    <div class="screen done">
      <header class="done-top">
        <div class="done-mark">${icon.check}</div>
        <button class="icon-btn" data-action="home" aria-label="Close">${icon.close}</button>
      </header>
      <h1 class="done-title">Workout<br>complete</h1>
      <p class="done-sub">${esc(r.workoutName)}</p>

      <dl class="stats">
        <div><dt>Time</dt><dd>${fmtDuration(r.finishedAt - r.startedAt)}</dd></div>
        <div><dt>Exercises</dt><dd>${r.exercises.length}<small>/${r.total}</small></dd></div>
        <div><dt>Muscles</dt><dd>${ranked.length}</dd></div>
      </dl>

      <section class="bodymap">
        <div class="bodymap-stage"><div class="stage-canvas" id="stage-canvas"></div></div>
        <div class="bodymap-side">
          <h2 class="section-title">Muscles trained</h2>
          <div class="bodymap-scale"><span>Fewer sets</span><i></i><span>More</span></div>
          <ol class="mlist">${ranked
            .map(([m, v]) => `<li><span class="mdot" style="--lv:${levels[m]}"></span><span>${esc(muscleName(m))}</span><b>${setsText(v)}</b></li>`)
            .join('')}</ol>
        </div>
      </section>

      <h2 class="section-title">Exercises</h2>
      <ol class="xlist">${r.exercises.map((e) => `<li><span class="xname">${esc(e.name)}</span><span class="xsets">${e.sets} × ${esc(e.reps)}</span></li>`).join('')}</ol>
      <p class="mnote">Set counts: primary muscle = 1 per set, secondary = ½.</p>

      <div class="home-dock"><button class="btn btn-primary btn-xl" data-action="home">Done</button></div>
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
