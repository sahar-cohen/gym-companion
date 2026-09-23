// Exercise library: browse by muscle group, open an exercise to study its
// technique, and pick exercises for a custom workout.
import { state, render, resolve, savePicks, saveWorkouts, workoutById } from '../app/state.js';
import { esc, uid } from '../app/util.js';
import { GROUPS, LIBRARY, EXERCISES, groupName, fromLibrary } from '../data/exercises.js';
import { muscleName } from '../data/muscles.js';
import { save } from '../lib/storage.js';
import { icon } from '../ui/icons.js';
import { openSheet, closeSheet, sheetHead } from '../ui/sheets.js';
import { stageHtml, mountStage } from '../ui/technique.js';
import { startCustom, showToast } from './workout.js';

const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, '');

function matches(e, q) {
  if (!q) return true;
  const hay = norm([e.name, groupName(e.group), e.equipment, ...e.primary.map(muscleName)].join(' '));
  return norm(q).split(/\s+/).every((w) => hay.includes(w));
}

const picked = (id) => state.picks.includes(id);

function exRow(e) {
  const on = picked(e.id);
  return `<div class="lcard">
    <button class="lcard-main" data-action="open-ex" data-id="${e.id}">
      <span class="lcard-name">${esc(e.name)}</span>
      <span class="lcard-meta">${esc(e.equipment)} · ${esc(e.primary.map(muscleName).join(', '))}</span>
    </button>
    <button class="pick ${on ? 'is-on' : ''}" data-action="pick" data-id="${e.id}" aria-pressed="${on}" aria-label="${on ? 'Remove from' : 'Add to'} custom workout">${on ? icon.check : icon.plus}</button>
  </div>`;
}

function listHtml() {
  const q = state.libQuery.trim();
  const g = state.libGroup;
  const hits = LIBRARY.filter((e) => (g === 'all' || e.group === g) && matches(e, q));
  if (!hits.length) return `<p class="empty-line">No exercises match “${esc(q)}”.</p>`;
  if (g !== 'all') return hits.map(exRow).join('');
  return GROUPS.map((grp) => {
    const rows = hits.filter((e) => e.group === grp.id);
    return rows.length ? `<section class="lgroup"><h2 class="section-title">${esc(grp.name)}<small>${rows.length}</small></h2><div class="lcards">${rows.map(exRow).join('')}</div></section>` : '';
  }).join('');
}

export function libraryHtml() {
  const chips = [{ id: 'all', name: 'All' }, ...GROUPS]
    .map((g) => `<button class="${state.libGroup === g.id ? 'is-on' : ''}" data-action="lib-group" data-g="${g.id}" aria-pressed="${state.libGroup === g.id}">${esc(g.name)}</button>`)
    .join('');
  return `
    <h1 class="home-title">Exercise<br>library</h1>
    <label class="search-box">${icon.search}<input id="lib-q" type="search" placeholder="Search ${LIBRARY.length} exercises" value="${esc(state.libQuery)}" autocomplete="off" enterkeyhint="search"></label>
    <div class="chips" role="group" aria-label="Muscle group">${chips}</div>
    <div class="lcards" id="lib-list">${listHtml()}</div>`;
}

export function pickTray() {
  const n = state.picks.length;
  if (!n) return '';
  return `<div class="tray">
    <button class="tray-count" data-action="tray">${n} exercise${n === 1 ? '' : 's'}<small>Review</small></button>
    <button class="btn btn-primary" data-action="tray-start">${icon.play}<span>Start</span></button>
  </div>`;
}

export function bindLibrary(app) {
  const input = app.querySelector('#lib-q');
  input?.addEventListener('input', () => {
    state.libQuery = input.value;
    document.getElementById('lib-list').innerHTML = listHtml();
  });
  // Keep the chosen group chip in view.
  app.querySelector('.chips .is-on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

function refreshPicks() {
  savePicks();
  render();
}

// ---------- Exercise page ----------

// The exercise being shown: a library entry, or a workout's copy (with its dose).
function detailExercise() {
  const d = state.detail;
  if (d.from === 'plan') {
    const ex = workoutById(d.workoutId)?.exercises[d.index];
    if (ex) return { ...ex, group: EXERCISES[ex.id]?.group, equipment: EXERCISES[ex.id]?.equipment };
  }
  const lib = EXERCISES[d.id];
  return lib && { ...lib, ...lib.dose };
}

export function renderExercise(app) {
  const raw = detailExercise();
  if (!raw) {
    state.screen = 'home';
    return render();
  }
  const ex = resolve(raw);
  const fromLib = state.detail.from === 'library';
  const eyebrow = [groupName(ex.group), ex.equipment].filter(Boolean).join(' · ');
  const on = picked(ex.id);

  app.innerHTML = `
    <div class="screen exercise">
      <header class="topbar">
        <div class="topbar-row">
          <button class="icon-btn" data-action="close-ex" aria-label="Back">${icon.back}</button>
          <div class="topbar-mid">
            <span class="topbar-title">${fromLib ? 'Library' : esc(workoutById(state.detail.workoutId)?.name ?? '')}</span>
            ${eyebrow ? `<span class="topbar-sub">${esc(eyebrow)}</span>` : ''}
          </div>
          <span class="icon-btn-space" style="width:44px"></span>
        </div>
      </header>
      <main class="ex">
        <div class="ex-head">
          <h1 class="ex-name">${esc(ex.name)}</h1>
          <div class="ex-meta">
            <span class="ex-dose">${ex.sets} × ${esc(ex.reps)}</span>
            ${ex.repsNote ? `<span class="ex-note">${esc(ex.repsNote)}</span>` : ''}
            ${fromLib ? '<span class="ex-note">typical</span>' : ''}
          </div>
        </div>
        ${stageHtml(ex)}
      </main>
      ${
        fromLib
          ? `<footer class="dock">
              <button class="btn btn-primary btn-xl dock-done ${on ? 'is-added' : ''}" data-action="pick" data-id="${ex.id}">
                <span>${on ? 'Added to custom workout' : 'Add to custom workout'}</span>
                ${on ? '<small>Tap to remove</small>' : ''}
              </button>
            </footer>`
          : ''
      }
    </div>`;
  mountStage(ex);
}

// ---------- Custom workout ----------

const customExercises = () => state.picks.filter((id) => EXERCISES[id]).map((id) => fromLibrary(id));

function traySheet() {
  const rows = state.picks
    .filter((id) => EXERCISES[id])
    .map(
      (id, i) => `<div class="ov-row">
        <span class="ov-idx">${i + 1}</span>
        <span class="ov-body"><span class="ov-name">${esc(EXERCISES[id].name)}</span><span class="ov-meta">${esc(EXERCISES[id].equipment)}</span></span>
        <span class="row-tools">
          <button class="icon-btn sm" data-action="tray-move" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">${icon.up}</button>
          <button class="icon-btn sm" data-action="pick" data-id="${id}" data-sheet="1" aria-label="Remove">${icon.close}</button>
        </span>
      </div>`,
    )
    .join('');
  openSheet(
    `${sheetHead('Custom workout')}
    <div class="ov-list">${rows}</div>
    <div class="sheet-actions">
      <button class="btn btn-ghost" data-action="tray-save">Save as workout</button>
      <button class="btn btn-primary" data-action="tray-start">${icon.play}<span>Start</span></button>
    </div>
    <button class="btn btn-danger-ghost btn-block sheet-gap" data-action="tray-clear">${icon.trash}<span>Clear all</span></button>`,
  );
}

function saveSheet() {
  openSheet(`
    ${sheetHead('Save workout')}
    <label class="field"><span class="field-label">Name</span>
      <input class="field-input" id="new-name" value="Custom ${state.workouts.length + 1}" maxlength="40" autocomplete="off"></label>
    <button class="btn btn-primary btn-block" data-action="tray-save-yes">Save</button>`);
  const input = document.getElementById('new-name');
  input.focus();
  input.select();
}

export const libraryActions = {
  'lib-group': (el) => {
    state.libGroup = el.dataset.g;
    render();
  },
  'open-ex': (el) => {
    state.detail = { id: el.dataset.id, from: 'library', scroll: window.scrollY };
    state.screen = 'exercise';
    render();
    window.scrollTo(0, 0);
  },
  'close-ex': () => {
    const d = state.detail;
    state.screen = d.from === 'plan' ? 'plan' : 'home';
    render();
    window.scrollTo(0, d.scroll ?? 0);
  },
  pick: (el) => {
    const id = el.dataset.id;
    state.picks = picked(id) ? state.picks.filter((x) => x !== id) : [...state.picks, id];
    refreshPicks();
    if (el.dataset.sheet) state.picks.length ? traySheet() : closeSheet();
  },
  tray: traySheet,
  'tray-move': (el) => {
    const i = +el.dataset.i;
    const j = i + +el.dataset.d;
    [state.picks[i], state.picks[j]] = [state.picks[j], state.picks[i]];
    refreshPicks();
    traySheet();
  },
  'tray-clear': () => {
    state.picks = [];
    refreshPicks();
    closeSheet();
  },
  'tray-start': () => {
    const exercises = customExercises();
    if (!exercises.length) return;
    closeSheet();
    startCustom({ id: 'custom', name: 'Custom workout', exercises });
  },
  'tray-save': saveSheet,
  'tray-save-yes': () => {
    const name = document.getElementById('new-name')?.value.trim() || `Custom ${state.workouts.length + 1}`;
    const w = { id: uid('w'), name, exercises: customExercises() };
    state.workouts.push(w);
    saveWorkouts();
    state.picks = [];
    savePicks();
    closeSheet();
    state.tab = 'workouts';
    save('tab', state.tab);
    state.planId = w.id;
    state.screen = 'plan';
    render();
    showToast(`Saved “${name}”`);
  },
};
