import { state, render, persistSession, currentWorkout, workoutById, resolve, saveSettings } from '../app/state.js';
import { esc, fmtDuration } from '../app/util.js';
import { getViewer } from '../app/viewer.js';
import { save } from '../lib/storage.js';
import { newSession, blocks, doneCount, nextOpen, supersetLabel, supersetPartners } from '../lib/session.js';
import { keepAwake, haptic } from '../lib/device.js';
import { coach, stop as stopCoach, preload as preloadCoach } from '../lib/coach.js';
import { icon } from '../ui/icons.js';
import { openSheet, closeSheet, sheetHead } from '../ui/sheets.js';
import { techniqueNotes, stageHtml, mountStage, forgetStage } from '../ui/technique.js';

// Voice coach, only when enabled.
const say = (fn, ...args) => {
  if (!state.settings.voice) return;
  preloadCoach();
  coach[fn](...args);
};

const pad2 = (n) => String(n).padStart(2, '0');
const doseText = (ex) => `${ex.sets} × ${ex.reps}`;

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

function progress(w, s) {
  return w.exercises
    .map((_, i) => `<span class="tick ${s.done[i] ? 'is-done' : ''} ${i === s.exIndex ? 'is-cur' : ''}"></span>`)
    .join('');
}

// "Straight into Rear delt fly" / "Then rest, back to Lateral raise".
function supersetLine(w, i) {
  const ss = supersetPartners(w, i);
  if (!ss) return '';
  const label = supersetLabel(w, i);
  const last = ss.pos === ss.block.length - 1;
  const other = w.exercises[last ? ss.block[0] : ss.block[ss.pos + 1]];
  const text = last ? `Rest after this, then back to ${other.name}` : `No rest. Go straight into ${other.name}`;
  return `<p class="superset"><span class="superset-tag">Superset ${label}</span><span>${esc(text)}</span></p>`;
}

export function renderWorkout(app) {
  const w = currentWorkout();
  const s = state.session;
  const i = s.exIndex;
  const ex = resolve(w.exercises[i]);
  const n = w.exercises.length;
  const next = nextOpen({ ...s, done: s.done.map((d, k) => d || k === i) }, i);
  const finishing = next === null;
  const nextName = finishing ? null : w.exercises[next].name;

  app.innerHTML = `
    <div class="screen workout">
      <header class="bar">
        <button class="icon-btn" data-action="end" aria-label="End workout">${icon.close}</button>
        <div class="bar-mid"><span class="count"><b>${pad2(i + 1)}</b> / ${pad2(n)}</span></div>
        <button class="icon-btn" data-action="overview" aria-label="All exercises">${icon.list}</button>
      </header>
      <div class="ticks" aria-label="${doneCount(s)} of ${n} exercises done">${progress(w, s)}</div>

      <main class="ex">
        <div class="ex-head">
          <h1 class="ex-name">${esc(ex.name)}</h1>
          <p class="ex-dose"><b>${esc(doseText(ex))}</b>${ex.repsNote ? `<span>${esc(ex.repsNote)}</span>` : ''}</p>
          ${supersetLine(w, i)}
        </div>
        ${stageHtml(ex)}
        <div class="notes">${techniqueNotes(ex)}</div>
      </main>

      <footer class="dock">
        <button class="dock-back" data-action="prev" ${i === 0 ? 'disabled' : ''} aria-label="Previous exercise">${icon.prev}</button>
        <button class="dock-go" data-action="done-ex">
          <span class="dock-go-main">${finishing ? 'Finish workout' : s.done[i] ? 'Next' : 'Done'}</span>
          ${nextName ? `<span class="dock-go-sub">Next: ${esc(nextName)}</span>` : ''}
          ${icon.next}
        </button>
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
    <div class="sheet-stack">
      ${d ? `<button class="btn btn-primary btn-block" data-action="finish">Finish</button>` : ''}
      <button class="btn btn-ghost btn-block" data-action="discard-workout">${d ? 'Discard' : 'End without saving'}</button>
      <button class="btn btn-text btn-block" data-action="close-sheet">Keep going</button>
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
    return `<button class="row ${s.done[i] ? 'is-done' : ''} ${i === s.exIndex ? 'is-cur' : ''}" data-action="jump" data-i="${i}">
      <span class="row-num">${s.done[i] ? icon.check : pad2(i + 1)}</span>
      <span class="row-body"><span class="row-title">${esc(ex.name)}</span><span class="row-sub">${esc(doseText(ex))}${ex.repsNote ? ` ${esc(ex.repsNote)}` : ''}</span></span>
    </button>`;
  };
  const items = blocks(w)
    .map((b) => (b.length > 1 ? `<div class="row-group"><span class="row-group-label">Superset</span>${b.map(row).join('')}</div>` : row(b[0])))
    .join('');
  openSheet(
    `${sheetHead(esc(w.name))}
    <div class="rows">${items}</div>
    <label class="switch-row"><span>Voice coach<small>Announces each exercise</small></span>
      <input type="checkbox" class="switch" data-setting="voice" ${state.settings.voice ? 'checked' : ''}></label>
    <button class="btn btn-ghost btn-block" data-action="end">End workout</button>`,
    { tall: true },
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
};

// Voice toggled from a switch (overview sheet or settings).
export function onVoiceSetting() {
  saveSettings();
  if (!state.settings.voice) stopCoach();
  else say('voiceOn');
}
