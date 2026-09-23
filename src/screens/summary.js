import { state, render } from '../app/state.js';
import { esc, fmtDuration, fmtKg, fmtDate, daysAgo } from '../app/util.js';
import { getViewer } from '../app/viewer.js';
import { muscleName } from '../data/muscles.js';
import { muscleLoad, volume, allHistory, removeRecord } from '../lib/history.js';
import { icon } from '../ui/icons.js';
import { openSheet, closeSheet, confirmSheet, sheetHead } from '../ui/sheets.js';
import { showToast } from './workout.js';

export function renderSummary(app) {
  const r = state.summary;
  const sets = r.exercises.reduce((n, e) => n + e.sets.length, 0);
  const vol = r.exercises.reduce((n, e) => n + volume(e.sets), 0);
  const load = muscleLoad(r);
  const max = Math.max(1, ...Object.values(load));
  const levels = Object.fromEntries(Object.entries(load).map(([m, v]) => [m, 0.25 + 0.75 * (v / max)]));
  const ranked = Object.entries(load).sort((a, b) => b[1] - a[1]);
  const setsText = (v) => `${Number.isInteger(v) ? v : v.toFixed(1)} set${v === 1 ? '' : 's'}`;
  const isNew = r.finishedAt && Date.now() - r.finishedAt < 3 * 3600 * 1000;

  app.innerHTML = `
    <div class="screen done">
      <header class="done-top">
        ${isNew ? `<div class="done-mark">${icon.check}</div>` : '<span></span>'}
        <button class="icon-btn" data-action="home" aria-label="Close">${icon.close}</button>
      </header>
      <h1 class="done-title">${isNew ? 'Workout<br>complete' : esc(r.workoutName)}</h1>
      <p class="done-sub">${isNew ? esc(r.workoutName) + ' · ' : ''}${fmtDate(r.startedAt, true)}</p>

      <dl class="stats">
        <div><dt>Time</dt><dd>${fmtDuration(r.finishedAt - r.startedAt)}</dd></div>
        <div><dt>Sets</dt><dd>${sets}</dd></div>
        <div><dt>Volume</dt><dd>${Math.round(vol).toLocaleString('en-US')}<small> kg</small></dd></div>
      </dl>

      ${
        r.prs?.length
          ? `<section class="prs">${r.prs
              .map((p) => `<div class="pr">${icon.trophy}<span><b>New best</b> · ${esc(p.name)}: ${fmtKg(p.w)} kg <small>(was ${fmtKg(p.prev)})</small></span></div>`)
              .join('')}</section>`
          : ''
      }

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
      <ol class="xlist">${r.exercises
        .map(
          (e) => `<li><span class="xname">${esc(e.name)}</span>
            <span class="xsets">${e.sets.map((x) => (x.w ? `${fmtKg(x.w)}×${x.r}` : `${x.r} reps`)).join(' · ')}</span></li>`,
        )
        .join('')}</ol>
      <p class="mnote">Set counts: primary muscle = 1 per set, secondary = ½.</p>
      ${
        allHistory().some((x) => x.id === r.id)
          ? `<button class="btn btn-danger-ghost btn-block summary-delete" data-action="delete-record" data-id="${r.id}">${icon.trash}<span>Delete from history</span></button>`
          : ''
      }

      <div class="home-dock"><button class="btn btn-primary btn-xl" data-action="home">Done</button></div>
    </div>`;

  const viewer = getViewer();
  viewer.mount(document.getElementById('stage-canvas'));
  viewer.showBodyMap(levels);
  viewer.start();
}

// Every saved workout, newest first, with delete.
function historyListSheet() {
  const all = allHistory();
  const rows = all
    .map((r) => {
      const sets = r.exercises.reduce((n, e) => n + e.sets.length, 0);
      return `<div class="hl-row">
        <button class="hl-main" data-action="open-summary" data-id="${r.id}">
          <b>${esc(r.workoutName)}</b><small>${fmtDate(r.startedAt, true)} · ${daysAgo(r.startedAt)} · ${sets} set${sets === 1 ? '' : 's'}</small>
        </button>
        <button class="icon-btn sm" data-action="delete-record" data-id="${r.id}" aria-label="Delete ${esc(r.workoutName)} from ${fmtDate(r.startedAt)}">${icon.trash}</button>
      </div>`;
    })
    .join('');
  openSheet(`${sheetHead('History')}${all.length ? `<div class="hl-list">${rows}</div>` : '<p class="sheet-text">No saved workouts yet.</p>'}`, { tall: true });
}

export const summaryActions = {
  'history-all': historyListSheet,
  'delete-record': (el) => {
    const r = allHistory().find((x) => x.id === el.dataset.id);
    if (!r) return;
    confirmSheet(
      'Delete this workout?',
      `${esc(r.workoutName)}, ${fmtDate(r.startedAt, true)}. It’s removed from your history, progress charts and “last time”. This can’t be undone.`,
      'Delete',
      'delete-record-yes',
      { danger: true, data: `data-id="${r.id}"` },
    );
  },
  'delete-record-yes': (el) => {
    removeRecord(el.dataset.id);
    closeSheet();
    if (state.screen === 'done') {
      state.summary = null;
      state.screen = 'home';
    }
    render();
    showToast('Deleted from history');
    if (state.screen === 'home' && allHistory().length) historyListSheet();
  },
  home: () => {
    state.summary = null;
    state.screen = 'home';
    render();
  },
  'open-summary': (el) => {
    const r = allHistory().find((x) => x.id === el.dataset.id);
    if (!r) return;
    closeSheet();
    state.summary = r;
    state.screen = 'done';
    render();
  },
};
