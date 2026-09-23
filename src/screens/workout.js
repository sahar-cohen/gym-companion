import { state, render, persistSession, currentWorkout, workoutById, resolve, restFor, saveSettings } from '../app/state.js';
import { esc, fmtClock, fmtKg, fmtDate, daysAgo, targetReps } from '../app/util.js';
import { getViewer } from '../app/viewer.js';
import { muscleName } from '../data/muscles.js';
import { save } from '../lib/storage.js';
import { newSession, blocks, afterSet, doneCount, isComplete, totals, supersetLabel } from '../lib/session.js';
import { keepAwake, chime, tick, buzz, haptic } from '../lib/device.js';
import { lastFor, seriesFor, volume, toRecord, addRecord, bestBefore } from '../lib/history.js';
import * as voice from '../lib/voice.js';
import { icon } from '../ui/icons.js';
import { openSheet, closeSheet, confirmSheet, sheetHead } from '../ui/sheets.js';
import { progressChart } from '../ui/chart.js';
import { playerHTML, startPolling, stopPolling, autoStartPlaylist } from '../ui/player.js';

let shownKey = null;

// ---------- Helpers ----------

const speak = (text, opts) => state.settings.voice && voice.say(text, opts);

// Current weight/reps for the next set of exercise i.
function draftFor(i) {
  const s = state.session;
  const ex = currentWorkout().exercises[i];
  if (s.draft[i]) return s.draft[i];
  const logged = s.log[i].filter(Boolean).at(-1);
  const last = lastFor(ex.id, s.startedAt)?.sets[0];
  const d = logged ?? last ?? { w: ex.weight ?? 0, r: targetReps(ex.reps) };
  s.draft[i] = { w: ex.bodyweight ? 0 : d.w, r: d.r };
  return s.draft[i];
}

const setLabel = (ex, x) => (ex.bodyweight || !x.w ? `${x.r} reps` : `${fmtKg(x.w)}×${x.r}`);

function lastTimeText(ex) {
  const last = lastFor(ex.id, state.session?.startedAt ?? Infinity);
  if (!last) return null;
  const top = last.sets[0];
  const all = last.sets.map((x) => x.r).join(', ');
  const same = last.sets.every((x) => x.w === top.w);
  const main = ex.bodyweight || !top.w ? `${all} reps` : same ? `${fmtKg(top.w)} kg × ${all}` : last.sets.map((x) => setLabel(ex, x)).join(', ');
  return { short: `Last ${setLabel(ex, top)}`, full: `${main}, ${daysAgo(last.at)}` };
}

function blockOfIndex(w, i) {
  return blocks(w).find((b) => b.includes(i));
}

// The first open exercise after the current block (supersets count as one).
function upNext(w, s) {
  const b = blockOfIndex(w, s.exIndex);
  const n = w.exercises.findIndex((e, k) => k > b[b.length - 1] && !isComplete(s, k));
  return n >= 0 ? w.exercises[n].name : null;
}

function announceExercise(i, prefix = '') {
  const ex = currentWorkout().exercises[i];
  speak(`${prefix}${ex.name}. ${voice.doseText(ex, ex.bodyweight ? 0 : draftFor(i).w)}.`);
}

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

function flash(title, sub) {
  document.querySelector('.go-flash')?.remove();
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div class="go-flash" data-action="dismiss-flash" role="alert"><b>${esc(title)}</b><span>${esc(sub)}</span></div>`,
  );
  setTimeout(() => document.querySelector('.go-flash')?.classList.add('is-out'), 1600);
  setTimeout(() => document.querySelector('.go-flash')?.remove(), 2100);
}

// ---------- Render ----------

function progressBar(w, s) {
  return blocks(w)
    .map((b) => {
      const total = b.reduce((n, i) => n + s.done[i].length, 0);
      const done = b.reduce((n, i) => n + doneCount(s, i), 0);
      const skipped = b.every((i) => s.skipped[i] && !isComplete(s, i));
      return `<span class="seg ${b.includes(s.exIndex) ? 'is-cur' : ''} ${skipped ? 'is-skipped' : ''}" style="flex-grow:${total}">
        <span class="seg-fill" style="width:${(done / total) * 100}%"></span></span>`;
    })
    .join('');
}

function setButtons(ex, i, s) {
  const nextSet = s.done[i].indexOf(false);
  return s.done[i]
    .map((d, j) => {
      const logged = s.log[i][j];
      const cls = d ? 'is-done' : j === nextSet ? 'is-next' : '';
      return `<button class="set ${cls}" data-action="set" data-i="${i}" data-j="${j}" aria-pressed="${d}" aria-label="Set ${j + 1}${d ? ', done' : ''}">
        <span class="set-num">${d ? icon.check : j + 1}</span>
        <span class="set-reps">${d && logged ? setLabel(ex, logged) : `${esc(ex.reps)}${ex.repsNote ? ' / side' : ''}`}</span>
      </button>`;
    })
    .join('');
}

function logger(ex, i) {
  const d = draftFor(i);
  const weight = ex.bodyweight
    ? ''
    : `<div class="logf">
        <button class="logf-btn" data-action="log-step" data-f="w" data-d="-2.5" aria-label="Less weight">${icon.minus}</button>
        <label class="logf-val"><input data-log="w" inputmode="decimal" enterkeyhint="done" value="${fmtKg(d.w)}" aria-label="Weight in kg"><span>kg</span></label>
        <button class="logf-btn" data-action="log-step" data-f="w" data-d="2.5" aria-label="More weight">${icon.plus}</button>
      </div>`;
  return `<div class="logger ${ex.bodyweight ? 'is-single' : ''}">
    ${weight}
    <div class="logf">
      <button class="logf-btn" data-action="log-step" data-f="r" data-d="-1" aria-label="Fewer reps">${icon.minus}</button>
      <label class="logf-val"><input data-log="r" inputmode="numeric" enterkeyhint="done" value="${d.r}" aria-label="Reps"><span>reps</span></label>
      <button class="logf-btn" data-action="log-step" data-f="r" data-d="1" aria-label="More reps">${icon.plus}</button>
    </div>
  </div>`;
}

function restSheet(w, s) {
  const r = s.rest;
  if (!r) return '';
  const ex = w.exercises[s.exIndex];
  const next = `Set ${Math.min(doneCount(s, s.exIndex) + 1, ex.sets)} of ${ex.sets}`;
  const left = (r.endsAt - Date.now()) / 1000;
  const fresh = Date.now() - (r.startedAt ?? 0) < 500;
  return `<section class="rest ${fresh ? 'is-new' : ''}" aria-live="polite">
    <div class="rest-head">
      <div class="rest-head-text">
        <span class="eyebrow">Rest</span>
        <span class="rest-next">Next: <b>${esc(ex.name)}</b> · ${next}</span>
      </div>
      <button class="btn btn-ink btn-sm" data-action="rest-skip">Skip</button>
    </div>
    <div class="rest-row">
      <button class="round-btn" data-action="rest-minus" aria-label="15 seconds less">−15</button>
      <div class="rest-time" id="rest-time">${fmtClock(left)}</div>
      <button class="round-btn" data-action="rest-plus" aria-label="15 seconds more">+15</button>
    </div>
    <div class="rest-bar"><span id="rest-fill" style="width:${Math.max(0, Math.min(1, left / r.duration)) * 100}%"></span></div>
    ${r.adjusted ? `<div class="rest-saved">Saved ${restFor(w.exercises[r.forEx])}s rest for ${esc(w.exercises[r.forEx].name)}</div>` : ''}
  </section>`;
}

export function renderWorkout(app) {
  const w = currentWorkout();
  const s = state.session;
  const i = s.exIndex;
  const ex = resolve(w.exercises[i]);
  const ss = supersetLabel(w, i);
  const t = totals(s);
  const n = w.exercises.length;
  const last = lastTimeText(ex);
  const nextName = upNext(w, s);

  const variantSwitch = ex.variants?.length
    ? `<div class="seg-ctl" role="group" aria-label="Variant">${ex.variants
        .map((v) => `<button data-action="variant" data-ex="${ex.id}" data-v="${v.id}" class="${v.id === ex.variantId ? 'is-on' : ''}">${esc(v.label)}</button>`)
        .join('')}</div>`
    : '';

  app.innerHTML = `
    <div class="screen workout ${s.rest ? 'is-resting' : ''}">
      <header class="topbar">
        <div class="topbar-row">
          <button class="icon-btn" data-action="end" aria-label="End workout">${icon.close}</button>
          <div class="topbar-mid">
            <span class="topbar-title">${esc(w.name)}</span>
            <span class="topbar-sub"><span id="elapsed">${fmtClock((Date.now() - s.startedAt) / 1000)}</span> · ${t.done}/${t.total} sets</span>
          </div>
          <button class="icon-btn ${state.settings.voice ? '' : 'is-off'}" data-action="voice-toggle" aria-pressed="${state.settings.voice}" aria-label="Voice coach">${state.settings.voice ? icon.voiceOn : icon.voiceOff}</button>
          <button class="icon-btn" data-action="overview" aria-label="All exercises">${icon.list}</button>
        </div>
        <div class="progress" aria-label="Workout progress">${progressBar(w, s)}</div>
        <div id="player-slot">${playerHTML()}</div>
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
            ${ex.weight ? `<span class="wchip">${fmtKg(ex.weight)} kg</span>` : ''}
            ${last ? `<button class="lasttime" data-action="history" data-ex="${ex.id}" aria-label="History. Last time ${esc(last.full)}">${icon.chart}<span>${esc(last.short)}</span></button>` : ''}
          </div>
        </div>

        <div class="stage">
          <div class="stage-canvas" id="stage-canvas"></div>
          <div class="stage-top">
            ${ex.confirm ? `<button class="flag" data-action="info">${icon.flag}<span>Confirm with coach</span></button>` : '<span></span>'}
            ${variantSwitch}
          </div>
          ${state.hintSeen ? '' : `<div class="stage-hint" id="stage-hint">${icon.rotate}<span>Drag to rotate</span></div>`}
          <div class="stage-bottom">
            <button class="info-pill" data-action="info">
              <span class="legend-key key-primary"></span>
              <span class="info-pill-text">${esc(ex.primary.map(muscleName).join(', '))}</span>
              <span class="info-pill-more">Form tips</span>
            </button>
            <button class="icon-btn stage-reset" data-action="reset-view" aria-label="Reset view">${icon.reset}</button>
          </div>
        </div>
      </main>

      <footer class="dock">
        ${restSheet(w, s)}
        ${s.rest ? '' : logger(ex, i)}
        <div class="sets" style="--n:${ex.sets}">${setButtons(ex, i, s)}</div>
        <nav class="navrow">
          <button class="nav-btn" data-action="prev" ${i === 0 ? 'disabled' : ''} aria-label="Previous exercise">${icon.prev}<span>Prev</span></button>
          <button class="nav-btn" data-action="skip" aria-label="Skip exercise">${icon.skip}<span>Skip</span></button>
          <button class="nav-btn" data-action="next" ${i === n - 1 ? 'disabled' : ''} aria-label="Next exercise"><span>Next</span>${icon.next}</button>
        </nav>
      </footer>
      ${state.toast ? `<div class="toast" role="status">${esc(state.toast)}</div>` : ''}
    </div>`;

  const viewer = getViewer();
  viewer.mount(document.getElementById('stage-canvas'));
  const key = `${w.id}:${i}:${ex.variantId ?? ''}:${ex.animation}`;
  if (key !== shownKey) {
    viewer.show(ex);
    shownKey = key;
  }
  viewer.start();
  startPolling();
}

export function leaveWorkout() {
  shownKey = null;
  stopPolling();
}

// ---------- Flow ----------

export function startWorkout(workoutId) {
  const w = workoutById(workoutId);
  if (!w?.exercises.length) return;
  state.session = newSession(w);
  state.session.log = w.exercises.map((e) => Array(e.sets).fill(null));
  state.session.draft = {};
  persistSession();
  state.screen = 'workout';
  keepAwake(true);
  render();
  announceExercise(0, 'Let’s go. First up: ');
  autoStartPlaylist(w, showToast);
}

export function finishWorkout() {
  const w = currentWorkout();
  const s = state.session;
  s.finishedAt = Date.now();
  s.rest = null;
  const record = toRecord(w, s);
  // Personal bests: heavier than anything logged before this session.
  record.prs = record.exercises
    .map((e) => ({ id: e.id, name: e.name, w: Math.max(...e.sets.map((x) => x.w || 0)), prev: bestBefore(e.id, s.startedAt) }))
    .filter((p) => p.w > 0 && p.prev > 0 && p.w > p.prev);
  if (record.exercises.length) addRecord(record);
  state.summary = record;
  state.session = null;
  persistSession();
  keepAwake(false);
  closeSheet();
  voice.stop();
  speak('Workout complete. Nice work.');
  state.screen = 'done';
  render();
}

function go(i, { announce = true } = {}) {
  const s = state.session;
  s.exIndex = i;
  s.rest = null;
  persistSession();
  render();
  if (announce) announceExercise(i);
}

function toggleSet(i, j) {
  const w = currentWorkout();
  const s = state.session;
  if (s.done[i][j]) return setSheet(i, j);
  haptic();
  s.done[i][j] = true;
  s.log[i][j] = { ...draftFor(i) };
  const { next, rest } = afterSet(w, s, i);
  if (next === null) return finishWorkout();
  const changed = next !== i;
  s.exIndex = next;
  const nx = w.exercises[next];
  const setNo = Math.min(doneCount(s, next) + 1, nx.sets);
  if (rest) {
    const dur = restFor(w.exercises[i]);
    s.rest = { forEx: i, startedAt: Date.now(), duration: dur, endsAt: Date.now() + dur * 1000 };
    speak(`Rest ${dur} seconds. ${changed ? 'Next exercise: ' : 'Next: '}${nx.name}, set ${setNo} of ${nx.sets}.`);
  } else {
    s.rest = null;
    speak(`Now ${nx.name}, set ${setNo}. ${String(nx.reps).replace('–', ' to ')} reps.`);
  }
  persistSession();
  render();
}

function setSheet(i, j) {
  const ex = currentWorkout().exercises[i];
  const x = state.session.log[i][j] ?? { ...draftFor(i) };
  openSheet(`
    ${sheetHead(`Set ${j + 1}`)}
    <p class="sheet-text">${esc(ex.name)}</p>
    <div class="logger ${ex.bodyweight ? 'is-single' : ''} in-sheet">
      ${
        ex.bodyweight
          ? ''
          : `<div class="logf"><label class="logf-val"><input id="edit-w" inputmode="decimal" value="${fmtKg(x.w)}" aria-label="Weight in kg"><span>kg</span></label></div>`
      }
      <div class="logf"><label class="logf-val"><input id="edit-r" inputmode="numeric" value="${x.r}" aria-label="Reps"><span>reps</span></label></div>
    </div>
    <div class="sheet-actions">
      <button class="btn btn-ghost" data-action="set-undo" data-i="${i}" data-j="${j}">Mark not done</button>
      <button class="btn btn-primary" data-action="set-save" data-i="${i}" data-j="${j}">Save</button>
    </div>`);
}

const num = (v, fallback) => {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

function adjustRest(delta) {
  const w = currentWorkout();
  const r = state.session.rest;
  if (!r) return;
  const ex = w.exercises[r.forEx];
  state.restOverrides[ex.id] = Math.max(15, restFor(ex) + delta);
  save('restOverrides', state.restOverrides);
  r.endsAt = Math.max(Date.now() + 1000, r.endsAt + delta * 1000);
  r.duration = Math.max(15, r.duration + delta);
  r.adjusted = true;
  persistSession();
  render();
}

function endRest(completed, lateSec = 0) {
  const s = state.session;
  if (!s?.rest) return;
  s.rest = null;
  persistSession();
  render();
  if (!completed) return;
  const ex = currentWorkout().exercises[s.exIndex];
  const setNo = Math.min(doneCount(s, s.exIndex) + 1, ex.sets);
  if (lateSec > 5) {
    // Came back to the app after rest ended in the background.
    showToast(`Rest ended ${fmtClock(lateSec)} ago`);
    return;
  }
  if (state.settings.sound) chime();
  if (state.settings.vibrate) buzz();
  flash('Go', `${ex.name} · set ${setNo}`);
  setTimeout(() => speak(`Go. ${ex.name}, set ${setNo}.`), 450);
}

// ---------- History sheet ----------

function historySheet(exId) {
  const w = currentWorkout();
  const ex = w.exercises.find((e) => e.id === exId);
  const pts = seriesFor(exId);
  const bw = ex.bodyweight || pts.every((p) => !p.w);
  const chart = pts.length
    ? progressChart(pts, bw ? { unit: 'reps', value: (p) => p.r, tipText: (p) => `${p.r} reps` } : {})
    : '';
  const rows = pts
    .slice()
    .reverse()
    .map(
      (p) => `<li class="hist-row">
        <span class="hist-date">${fmtDate(p.at, true)}</span>
        <span class="hist-sets">${p.sets.map((x) => setLabel(ex, x)).join(' · ')}</span>
        ${bw ? '' : `<span class="hist-vol">${Math.round(p.volume).toLocaleString('en-US')} kg</span>`}
      </li>`,
    )
    .join('');
  openSheet(
    `${sheetHead(esc(ex.name))}
    ${
      pts.length
        ? `<p class="sheet-text">${bw ? 'Best reps per session' : 'Top set weight per session'}. Tap a point for details.</p>${chart}
           <h3 class="sheet-sub">Sessions</h3><ol class="hist">${rows}</ol>`
        : `<div class="empty"><div class="empty-title">No history yet</div><p>Log weight and reps on each set. After this workout, your progress shows up here.</p></div>`
    }`,
    { tall: true },
  );
}

// ---------- Muscles & form ----------

function infoSheet() {
  const w = currentWorkout();
  const ex = resolve(w.exercises[state.session.exIndex]);
  const chips = (ids, cls) => ids.map((m) => `<span class="mchip ${cls}">${esc(muscleName(m))}</span>`).join('');
  const last = lastTimeText(ex);
  openSheet(`
    ${sheetHead(esc(ex.name))}
    ${ex.confirm ? `<p class="confirm-note">${icon.flag}<span><b>Confirm with coach.</b> ${esc(ex.confirm)}</span></p>` : ''}
    ${ex.cues?.length ? `<h3 class="sheet-sub">Form</h3><ol class="cues">${ex.cues.map((c) => `<li>${esc(c)}</li>`).join('')}</ol>` : ''}
    <h3 class="sheet-sub">Muscles</h3>
    <div class="legend">
      <div class="legend-row"><span class="legend-key key-primary"></span><span class="legend-label">Primary</span>${chips(ex.primary, 'is-primary')}</div>
      ${ex.secondary?.length ? `<div class="legend-row"><span class="legend-key key-secondary"></span><span class="legend-label">Secondary</span>${chips(ex.secondary, 'is-secondary')}</div>` : ''}
    </div>
    <button class="btn btn-ghost btn-block sheet-gap" data-action="history" data-ex="${ex.id}">${icon.chart}<span>${last ? `History · last time ${esc(last.full)}` : 'History'}</span></button>`);
}

// ---------- Overview ----------

function overviewSheet() {
  const w = currentWorkout();
  const s = state.session;
  const items = blocks(w)
    .map((b) => {
      const rows = b
        .map((i) => {
          const ex = w.exercises[i];
          const d = doneCount(s, i);
          const status = isComplete(s, i) ? 'is-done' : s.skipped[i] ? 'is-skipped' : d ? 'is-partial' : '';
          const label = isComplete(s, i) ? 'Done' : s.skipped[i] ? 'Skipped' : `${d}/${ex.sets}`;
          return `<button class="ov-row ${status} ${i === s.exIndex ? 'is-cur' : ''}" data-action="jump" data-i="${i}">
            <span class="ov-idx">${isComplete(s, i) ? icon.check : i + 1}</span>
            <span class="ov-body"><span class="ov-name">${esc(ex.name)}</span><span class="ov-meta">${ex.sets} × ${esc(ex.reps)}${ex.weight ? ` · ${fmtKg(ex.weight)} kg` : ''}</span></span>
            <span class="ov-status">${label}</span>
          </button>`;
        })
        .join('');
      return b.length > 1 ? `<div class="ov-group"><span class="ov-group-label">Superset</span>${rows}</div>` : rows;
    })
    .join('');
  openSheet(`${sheetHead('Exercises')}<div class="ov-list">${items}</div>
    <button class="btn btn-ink btn-block" data-action="finish">Finish workout</button>`);
}

// ---------- Actions ----------

export const workoutActions = {
  set: (el) => toggleSet(+el.dataset.i, +el.dataset.j),
  'set-undo': (el) => {
    const s = state.session;
    s.done[+el.dataset.i][+el.dataset.j] = false;
    s.log[+el.dataset.i][+el.dataset.j] = null;
    persistSession();
    closeSheet();
    render();
  },
  'set-save': (el) => {
    const i = +el.dataset.i;
    const j = +el.dataset.j;
    const prev = state.session.log[i][j] ?? draftFor(i);
    state.session.log[i][j] = {
      w: num(document.getElementById('edit-w')?.value ?? 0, prev.w),
      r: Math.round(num(document.getElementById('edit-r')?.value, prev.r)),
    };
    persistSession();
    closeSheet();
    render();
  },
  'log-step': (el) => {
    const d = draftFor(state.session.exIndex);
    const f = el.dataset.f;
    d[f] = Math.max(0, Math.round((d[f] + +el.dataset.d) * 10) / 10);
    const input = document.querySelector(`[data-log="${f}"]`);
    if (input) input.value = f === 'w' ? fmtKg(d.w) : d.r;
    haptic();
    persistSession();
  },
  prev: () => go(Math.max(0, state.session.exIndex - 1)),
  next: () => go(Math.min(currentWorkout().exercises.length - 1, state.session.exIndex + 1)),
  skip: () => {
    const s = state.session;
    const w = currentWorkout();
    if (!isComplete(s, s.exIndex)) s.skipped[s.exIndex] = true;
    const open = (k) => !isComplete(s, k) && !s.skipped[k];
    const n = w.exercises.findIndex((e, k) => k > s.exIndex && open(k));
    const back = w.exercises.findIndex((e, k) => open(k));
    if (n >= 0) go(n);
    else if (back >= 0) go(back);
    else confirmSheet('Finish workout?', 'That was the last open exercise. Skipped exercises can still be reopened from the list.', 'Finish', 'finish');
  },
  overview: overviewSheet,
  jump: (el) => {
    closeSheet();
    go(+el.dataset.i);
  },
  end: () => confirmSheet('End workout?', 'Logged sets are saved to your history.', 'End workout', 'finish'),
  finish: finishWorkout,
  'rest-plus': () => adjustRest(15),
  'rest-minus': () => adjustRest(-15),
  'rest-skip': () => {
    voice.stop();
    endRest(false);
  },
  variant: (el) => {
    state.variants[el.dataset.ex] = el.dataset.v;
    save('variants', state.variants);
    render();
  },
  'reset-view': () => getViewer().resetView(),
  info: infoSheet,
  history: (el) => historySheet(el.dataset.ex),
  'voice-toggle': () => {
    state.settings.voice = !state.settings.voice;
    saveSettings();
    if (!state.settings.voice) voice.stop();
    else speak('Voice coach on.');
    render();
  },
  'dismiss-flash': () => document.querySelector('.go-flash')?.remove(),
};

// Weight/reps typed directly into the logger.
export function onLogInput(el) {
  if (!state.session) return;
  const d = draftFor(state.session.exIndex);
  const f = el.dataset.log;
  d[f] = f === 'r' ? Math.round(num(el.value, d.r)) : num(el.value, d.w);
  persistSession();
}

// ---------- Clock (every 200 ms) ----------

let lastSpoken = null;
export function clockTick() {
  const s = state.session;
  if (state.screen !== 'workout' || !s) return;
  const el = document.getElementById('elapsed');
  if (el) el.textContent = fmtClock((Date.now() - s.startedAt) / 1000);
  if (!s.rest) return;
  const left = (s.rest.endsAt - Date.now()) / 1000;
  if (left <= 0) return endRest(true, -left);
  const t = document.getElementById('rest-time');
  if (t) t.textContent = fmtClock(left);
  const f = document.getElementById('rest-fill');
  if (f) f.style.width = `${Math.min(1, left / s.rest.duration) * 100}%`;

  const sec = Math.ceil(left);
  if (sec === lastSpoken || document.visibilityState !== 'visible') return;
  lastSpoken = sec;
  if (state.settings.voice) {
    if (sec === 10 && s.rest.duration > 20) voice.say('10 seconds');
    else if (sec <= 3) voice.say(String(sec));
  } else if (sec <= 3 && state.settings.sound) {
    tick();
  }
}
