import { state, render, persistSession, currentWorkout, workoutById, resolve, saveSettings } from '../app/state.js';
import { esc, fmtDuration } from '../app/util.js';
import { getViewer } from '../app/viewer.js';
import { save } from '../lib/storage.js';
import { newSession, blocks, doneCount, nextOpen, supersetLabel, supersetPartners } from '../lib/session.js';
import { keepAwake, haptic } from '../lib/device.js';
import { coach, stop as stopCoach, preload as preloadCoach } from '../lib/coach.js';
import { icon } from '../ui/icons.js';
import { openSheet, closeSheet, sheetHead } from '../ui/sheets.js';
import { techniqueNotes, stageHtml, mountStage, forgetStage, musclesSheet } from '../ui/technique.js';

// Voice coach, only when enabled.
const say = (fn, ...args) => {
  if (!state.settings.voice) return;
  preloadCoach();
  coach[fn](...args);
};

let toastTimer;
export function showToast(text) {
  state.toast = text;
  clearTimeout(toastTimer);
  const el = document.querySelector('.toast');
  if (el) el.textContent = text;
  else document.querySelector('.screen')?.insertAdjacentHTML('beforeend', `<div class="toast" role="status">${esc(text)}</div>`);
  toastTimer = setTimeout(() => {
    state.toast = null;
    document.querySelector('.toast')?.remove();
  }, 3200);
}

// ---------- Render ----------

function progressBar(w, s) {
  return blocks(w)
    .map((b) => {
      const done = b.filter((i) => s.done[i]).length;
      return `<span class="seg ${b.includes(s.exIndex) ? 'is-cur' : ''}" style="flex-grow:${b.length}">
        <span class="seg-fill" style="width:${(done / b.length) * 100}%"></span></span>`;
    })
    .join('');
}

// "No rest: go straight into Rear delt fly" / "Rest after this, then back to Lateral raise".
function supersetLine(w, i) {
  const ss = supersetPartners(w, i);
  if (!ss) return '';
  const last = ss.pos === ss.block.length - 1;
  const other = w.exercises[last ? ss.block[0] : ss.block[ss.pos + 1]];
  return `<p class="ss-line">${last ? `Rest after this, then back to <b>${esc(other.name)}</b>` : `No rest: go straight into <b>${esc(other.name)}</b>`}</p>`;
}

export function renderWorkout(app) {
  const w = currentWorkout();
  const s = state.session;
  const i = s.exIndex;
  const ex = resolve(w.exercises[i]);
  const n = w.exercises.length;
  const ss = supersetLabel(w, i);
  const next = nextOpen({ ...s, done: s.done.map((d, k) => d || k === i) }, i);
  const finishing = next === null;
  const nextName = finishing ? null : w.exercises[next].name;

  app.innerHTML = `
    <div class="screen workout">
      <header class="topbar">
        <div class="topbar-row">
          <button class="icon-btn" data-action="end" aria-label="End workout">${icon.close}</button>
          <div class="topbar-mid">
            <span class="topbar-title">${esc(w.name)}</span>
            <span class="topbar-sub">${doneCount(s)}/${n} done</span>
          </div>
          <button class="icon-btn" data-action="overview" aria-label="All exercises">${icon.list}</button>
        </div>
        <div class="progress" aria-label="Workout progress">${progressBar(w, s)}</div>
      </header>

      <main class="ex">
        <div class="ex-head">
          <div class="eyebrow">
            <span class="eyebrow-main">${ss ? `<span class="ss-badge">${ss}</span>` : ''}${i + 1} of ${n}</span>
            <span class="eyebrow-next">${nextName ? `Then ${esc(nextName)}` : 'Last exercise'}</span>
          </div>
          <h1 class="ex-name">${esc(ex.name)}</h1>
          <div class="ex-meta">
            <span class="ex-dose">${ex.sets} × ${esc(ex.reps)}</span>
            ${ex.repsNote ? `<span class="ex-note">${esc(ex.repsNote)}</span>` : ''}
          </div>
          ${supersetLine(w, i)}
        </div>
        ${stageHtml(ex)}
        <div class="tech">${techniqueNotes(ex)}</div>
      </main>

      <footer class="dock">
        <div class="done-row">
          <button class="nav-btn" data-action="prev" ${i === 0 ? 'disabled' : ''} aria-label="Previous exercise">${icon.prev}</button>
          <button class="btn btn-primary btn-xl dock-done" data-action="done-ex">
            <span>${finishing ? 'Finish workout' : s.done[i] ? 'Next' : 'Done'}</span>
            ${nextName ? `<small>Next: ${esc(nextName)}</small>` : ''}
          </button>
        </div>
      </footer>
      ${state.toast ? `<div class="toast" role="status">${esc(state.toast)}</div>` : ''}
    </div>`;

  mountStage(ex);
}

export function leaveWorkout() {
  forgetStage();
}

// ---------- Flow ----------

function begin(session) {
  state.session = session;
  persistSession();
  state.screen = 'workout';
  keepAwake(true);
  render();
  say('start', currentWorkout().exercises[0]);
}

export const startWorkout = (workoutId) => {
  const w = workoutById(workoutId);
  if (w?.exercises.length) begin(newSession(w));
};

// A one-off workout from library picks; it isn't saved as a workout.
export const startCustom = (workout) => begin(newSession(workout, true));

function go(i, announce = true) {
  state.session.exIndex = i;
  persistSession();
  render();
  if (announce) say('exercise', currentWorkout().exercises[i]);
}

function doneExercise() {
  const s = state.session;
  haptic();
  s.done[s.exIndex] = true;
  const next = nextOpen(s, s.exIndex);
  if (next === null) return finishWorkout();
  go(next);
}

export function finishWorkout() {
  const w = currentWorkout();
  const s = state.session;
  const done = w.exercises.filter((_, i) => s.done[i]);
  state.summary = { workoutName: w.name, startedAt: s.startedAt, finishedAt: Date.now(), exercises: done, total: w.exercises.length };
  if (!s.workout) {
    state.lastDone[w.id] = s.startedAt;
    save('lastDone', state.lastDone);
  }
  state.session = null;
  persistSession();
  keepAwake(false);
  closeSheet();
  stopCoach();
  say('done');
  state.screen = 'done';
  render();
}

function endSheet() {
  const s = state.session;
  const d = doneCount(s);
  openSheet(`
    <div class="sheet-head"><h2>End workout?</h2></div>
    <p class="sheet-text">${
      d ? `${d} of ${s.done.length} exercises done, ${fmtDuration(Date.now() - s.startedAt)} in.` : 'Nothing marked done yet.'
    }</p>
    <div class="end-actions">
      ${d ? `<button class="btn btn-primary btn-block" data-action="finish">Finish</button>` : ''}
      <button class="btn btn-danger-ghost btn-block" data-action="discard-workout">${icon.trash}<span>${d ? 'Discard' : 'End without saving'}</span></button>
      <button class="btn btn-ghost btn-block" data-action="close-sheet">Keep going</button>
    </div>`);
}

function discardWorkout() {
  state.session = null;
  persistSession();
  keepAwake(false);
  stopCoach();
  closeSheet();
  state.screen = 'home';
  render();
}

// ---------- Overview ----------

function overviewSheet() {
  const w = currentWorkout();
  const s = state.session;
  const row = (i) => {
    const ex = w.exercises[i];
    return `<button class="ov-row ${s.done[i] ? 'is-done' : ''} ${i === s.exIndex ? 'is-cur' : ''}" data-action="jump" data-i="${i}">
      <span class="ov-idx">${s.done[i] ? icon.check : i + 1}</span>
      <span class="ov-body"><span class="ov-name">${esc(ex.name)}</span><span class="ov-meta">${ex.sets} × ${esc(ex.reps)}${ex.repsNote ? ` ${esc(ex.repsNote)}` : ''}</span></span>
      <span class="ov-status">${s.done[i] ? 'Done' : ''}</span>
    </button>`;
  };
  const items = blocks(w)
    .map((b) => (b.length > 1 ? `<div class="ov-group"><span class="ov-group-label">Superset</span>${b.map(row).join('')}</div>` : row(b[0])))
    .join('');
  openSheet(
    `${sheetHead('Exercises')}<div class="ov-list">${items}</div>
    <label class="srow"><span>Voice coach<small>Announces each exercise</small></span>
      <input type="checkbox" class="switch" data-setting="voice" ${state.settings.voice ? 'checked' : ''}></label>
    <button class="btn btn-ink btn-block sheet-gap" data-action="end">Finish workout</button>`,
  );
}

// ---------- Actions ----------

export const workoutActions = {
  'done-ex': doneExercise,
  prev: () => go(Math.max(0, state.session.exIndex - 1)),
  overview: overviewSheet,
  jump: (el) => {
    closeSheet();
    go(+el.dataset.i);
  },
  end: endSheet,
  finish: finishWorkout,
  'discard-workout': discardWorkout,
  variant: (el) => {
    state.variants[el.dataset.ex] = el.dataset.v;
    save('variants', state.variants);
    render();
  },
  'reset-view': () => getViewer().resetView(),
  muscles: () => musclesSheet(resolve(currentWorkout().exercises[state.session.exIndex])),
};

// Voice toggled from a switch (overview sheet or settings).
export function onVoiceSetting() {
  saveSettings();
  if (!state.settings.voice) stopCoach();
  else say('voiceOn');
}
