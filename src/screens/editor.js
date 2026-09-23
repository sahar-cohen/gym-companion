// In-app editor for workouts and exercises. Changes save to localStorage.
import { state, render, saveWorkouts, workoutById, persistSession } from '../app/state.js';
import { esc, slug, uid } from '../app/util.js';
import { DEFAULT_WORKOUTS } from '../data/workouts.js';
import { LIBRARY, EXERCISES, fromLibrary } from '../data/exercises.js';
import { MUSCLES, muscleName } from '../data/muscles.js';
import { ANIMATIONS } from '../three/animations.js';
import { blocks } from '../lib/session.js';
import { icon } from '../ui/icons.js';
import { openSheet, closeSheet, confirmSheet, sheetHead } from '../ui/sheets.js';
import { showToast } from './workout.js';

let draft = null; // exercise being edited: { index, ex }

const editing = () => workoutById(state.editor?.workoutId);
const locked = (w) => state.session?.workoutId === w.id;

export function openEditor(workoutId) {
  state.editor = { workoutId };
  state.screen = 'editor';
  render();
}

// ---------- Supersets ----------
// Stored as a shared `superset` id on consecutive exercises; edited as
// "linked to next" flags and re-derived on save.

const linksOf = (list) => list.map((e, k) => !!e.superset && e.superset === list[k + 1]?.superset);

function applyLinks(list, links) {
  let group = null;
  list.forEach((e, k) => {
    const inChain = links[k] || links[k - 1];
    if (!inChain) {
      e.superset = null;
      group = null;
      return;
    }
    if (!links[k - 1]) group = uid('ss');
    e.superset = group;
  });
}

// ---------- Render ----------

export function renderEditor(app) {
  const w = editing();
  if (!w) {
    state.screen = 'home';
    return render();
  }
  const isDefault = DEFAULT_WORKOUTS.some((d) => d.id === w.id);
  const lock = locked(w);

  const rows = blocks(w)
    .map((b) => {
      const inner = b
        .map((i) => {
          const ex = w.exercises[i];
          return `<div class="ed-row">
            <button class="ed-main" data-action="ed-exercise" data-i="${i}" ${lock ? 'disabled' : ''}>
              <span class="ov-idx">${i + 1}</span>
              <span class="ov-body"><span class="ov-name">${esc(ex.name)}</span>
                <span class="ov-meta">${ex.sets} × ${esc(ex.reps)}${ex.repsNote ? ` ${esc(ex.repsNote)}` : ''}</span></span>
            </button>
            <span class="ed-move">
              <button class="icon-btn sm" data-action="ed-move" data-i="${i}" data-d="-1" ${i === 0 || lock ? 'disabled' : ''} aria-label="Move up">${icon.up}</button>
              <button class="icon-btn sm" data-action="ed-move" data-i="${i}" data-d="1" ${i === w.exercises.length - 1 || lock ? 'disabled' : ''} aria-label="Move down">${icon.down}</button>
            </span>
          </div>`;
        })
        .join('');
      return b.length > 1 ? `<div class="ov-group"><span class="ov-group-label">Superset</span>${inner}</div>` : inner;
    })
    .join('');


  app.innerHTML = `
    <div class="screen editor">
      <header class="ed-top">
        <button class="icon-btn" data-action="ed-close" aria-label="Back">${icon.back}</button>
        <span class="topbar-title">Edit workout</span>
        <button class="btn btn-primary btn-sm" data-action="ed-close">Done</button>
      </header>

      ${
        lock
          ? `<div class="confirm-note">${icon.flag}<span>This workout is in progress. Finish or discard it to edit exercises.
              <button class="linkbtn" data-action="ed-discard-session">Discard session</button></span></div>`
          : ''
      }

      <label class="field">
        <span class="field-label">Name</span>
        <input class="field-input field-title" data-edit="workout-name" value="${esc(w.name)}" maxlength="40" autocomplete="off">
      </label>

      <h2 class="section-title">Exercises</h2>
      <div class="ov-list">${rows || '<p class="sheet-text">No exercises yet.</p>'}</div>
      <button class="btn btn-primary btn-block" data-action="ed-add" ${lock ? 'disabled' : ''}>${icon.plus}<span>Add exercise</span></button>

      <h2 class="section-title">Manage</h2>
      <div class="ed-danger">
        ${isDefault ? `<button class="btn btn-ghost" data-action="ed-restore">Restore original</button>` : ''}
        <button class="btn btn-danger-ghost" data-action="ed-delete">${icon.trash}<span>Delete workout</span></button>
      </div>
    </div>`;
}

function muscleChips() {
  const { primary, secondary } = draft.ex;
  return Object.keys(MUSCLES)
    .map((id) => {
      const st = primary.includes(id) ? 'is-primary' : secondary.includes(id) ? 'is-secondary' : '';
      return `<button type="button" class="mchip pick ${st}" data-action="ed-muscle" data-m="${id}" aria-pressed="${!!st}">${esc(muscleName(id))}</button>`;
    })
    .join('');
}

function exerciseSheet() {
  const w = editing();
  const { ex, index } = draft;
  const isNew = index < 0;
  const canLink = isNew ? false : index < w.exercises.length - 1;
  const linked = !isNew && linksOf(w.exercises)[index];
  const anims = Object.entries(ANIMATIONS)
    .map(([id, a]) => `<option value="${id}" ${ex.animation === id ? 'selected' : ''}>${esc(a.label)}</option>`)
    .join('');

  openSheet(
    `${sheetHead(isNew ? 'New exercise' : 'Edit exercise')}
    <form class="form" data-form="exercise" onsubmit="return false">
      <label class="field"><span class="field-label">Name</span>
        <input class="field-input" id="f-name" value="${esc(ex.name)}" maxlength="60" placeholder="e.g. Goblet squat" autocomplete="off"></label>

      <div class="field-row">
        <label class="field"><span class="field-label">Sets</span>
          <input class="field-input" id="f-sets" inputmode="numeric" value="${ex.sets}"></label>
        <label class="field"><span class="field-label">Reps</span>
          <input class="field-input" id="f-reps" value="${esc(ex.reps)}" placeholder="10 or 8–10"></label>
        <label class="field"><span class="field-label">Note</span>
          <input class="field-input" id="f-note" value="${esc(ex.repsNote ?? '')}" placeholder="per leg"></label>
      </div>

      ${canLink ? `<label class="srow"><span>Superset with next exercise<small>${esc(w.exercises[index + 1].name)}</small></span><input type="checkbox" class="switch" id="f-link" ${linked ? 'checked' : ''}></label>` : ''}

      ${
        ex.variants?.length
          ? `<p class="field-help">Demo: switchable in the workout (${ex.variants.map((v) => esc(v.label)).join(' / ')}).</p>`
          : `<label class="field"><span class="field-label">3D demo</span><select class="field-input" id="f-anim">${anims}</select></label>`
      }

      <div class="field"><span class="field-label">Muscles <small>tap once = primary, twice = secondary</small></span>
        <div class="chip-grid" id="muscle-chips">${muscleChips()}</div></div>

      <label class="field"><span class="field-label">Form cues <small>one per line</small></span>
        <textarea class="field-input" id="f-cues" rows="3">${esc((ex.cues ?? []).join('\n'))}</textarea></label>

      <label class="field"><span class="field-label">Avoid <small>common mistakes, one per line</small></span>
        <textarea class="field-input" id="f-avoid" rows="2">${esc((ex.avoid ?? []).join('\n'))}</textarea></label>

      <label class="field"><span class="field-label">“Confirm with coach” note <small>optional</small></span>
        <input class="field-input" id="f-confirm" value="${esc(ex.confirm ?? '')}"></label>

      <div class="sheet-actions">
        ${isNew ? `<button type="button" class="btn btn-ghost" data-action="close-sheet">Cancel</button>` : `<button type="button" class="btn btn-danger-ghost" data-action="ed-ex-delete">${icon.trash}<span>Delete</span></button>`}
        <button type="button" class="btn btn-primary" data-action="ed-ex-save">Save</button>
      </div>
    </form>`,
    { tall: true },
  );
}

// Add from the library (search + list), or type in a custom exercise.
function libRows(q) {
  const has = new Set(editing().exercises.map((e) => e.id));
  const needle = q.trim().toLowerCase();
  const hits = LIBRARY.filter((e) => !needle || `${e.name} ${e.equipment} ${e.group}`.toLowerCase().includes(needle));
  return (
    hits
      .map(
        (e) => `<button class="ov-row" data-action="ed-lib-add" data-id="${e.id}">
          <span class="ov-body"><span class="ov-name">${esc(e.name)}</span><span class="ov-meta">${esc(e.equipment)} · ${esc(e.primary.map(muscleName).join(', '))}</span></span>
          ${has.has(e.id) ? `<span class="ov-status">In workout</span>` : icon.plus}
        </button>`,
      )
      .join('') || '<p class="sheet-text">Nothing matches.</p>'
  );
}

function addSheet() {
  openSheet(
    `${sheetHead('Add exercise')}
    <label class="search-box">${icon.search}<input id="ed-q" type="search" placeholder="Search the library" autocomplete="off"></label>
    <div class="ov-list" id="ed-lib">${libRows('')}</div>
    <button class="btn btn-ghost btn-block" data-action="ed-exercise" data-i="-1">${icon.edit}<span>Custom exercise</span></button>`,
    { tall: true },
  );
  const input = document.getElementById('ed-q');
  input.addEventListener('input', () => (document.getElementById('ed-lib').innerHTML = libRows(input.value)));
}

// ---------- Actions ----------

const val = (id) => document.getElementById(id)?.value.trim() ?? '';
const lines = (id) => val(id).split('\n').map((c) => c.trim()).filter(Boolean).slice(0, 5);
const numOrNull = (s) => {
  const n = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const editorActions = {
  'ed-close': () => {
    const id = state.editor?.workoutId;
    state.editor = null;
    state.planId = id;
    state.screen = workoutById(id) ? 'plan' : 'home';
    render();
  },
  'ed-add': () => addSheet(),
  'ed-lib-add': (el) => {
    const w = editing();
    w.exercises.push(fromLibrary(el.dataset.id));
    saveWorkouts();
    closeSheet();
    render();
    showToast(`Added ${EXERCISES[el.dataset.id].name}`);
  },
  'ed-discard-session': () => {
    state.session = null;
    persistSession();
    render();
  },
  'ed-exercise': (el) => {
    const w = editing();
    const index = +el.dataset.i;
    const ex =
      index >= 0
        ? structuredClone(w.exercises[index])
        : { name: '', sets: 3, reps: '10', repsNote: '', superset: null, primary: [], secondary: [], cues: [], avoid: [], animation: 'none' };
    draft = { index, ex };
    exerciseSheet();
  },
  'ed-muscle': (el) => {
    const m = el.dataset.m;
    const e = draft.ex;
    if (e.primary.includes(m)) {
      e.primary = e.primary.filter((x) => x !== m);
      e.secondary.push(m);
    } else if (e.secondary.includes(m)) {
      e.secondary = e.secondary.filter((x) => x !== m);
    } else {
      e.primary.push(m);
    }
    document.getElementById('muscle-chips').innerHTML = muscleChips();
  },
  'ed-ex-save': () => {
    const w = editing();
    const name = val('f-name');
    if (!name) {
      document.getElementById('f-name').focus();
      return showToast('Give the exercise a name');
    }
    const e = draft.ex;
    const sets = Math.round(numOrNull(val('f-sets')) ?? 3);
    for (const k of ['weight', 'rest', 'bodyweight']) delete e[k]; // v1 fields
    Object.assign(e, {
      name,
      sets: Math.min(10, Math.max(1, sets)),
      reps: val('f-reps') || '10',
      repsNote: val('f-note') || undefined,
      cues: lines('f-cues'),
      avoid: lines('f-avoid'),
      confirm: val('f-confirm') || undefined,
    });
    const anim = document.getElementById('f-anim')?.value;
    if (anim) {
      e.animation = anim;
      delete e.camera; // use the demo's default camera
    }
    if (draft.index < 0) {
      e.id = `${slug(name)}-${uid('').slice(2)}`;
      w.exercises.push(e);
    } else {
      const links = linksOf(w.exercises);
      w.exercises[draft.index] = e;
      const box = document.getElementById('f-link');
      if (box) links[draft.index] = box.checked;
      applyLinks(w.exercises, links);
    }
    saveWorkouts();
    closeSheet();
    render();
  },
  'ed-ex-delete': () =>
    confirmSheet('Delete exercise?', `“${esc(draft.ex.name)}” will be removed from this workout.`, 'Delete', 'ed-ex-delete-yes', { danger: true }),
  'ed-ex-delete-yes': () => {
    const w = editing();
    const d = draft.index;
    const old = linksOf(w.exercises);
    // A–B–C superset minus B stays A–C; A–B minus B leaves A alone.
    const links = old.filter((_, k) => k !== d);
    if (d > 0) links[d - 1] = old[d - 1] && old[d];
    w.exercises.splice(d, 1);
    applyLinks(w.exercises, links);
    saveWorkouts();
    closeSheet();
    render();
  },
  'ed-move': (el) => {
    const w = editing();
    const i = +el.dataset.i;
    const j = i + +el.dataset.d;
    if (j < 0 || j >= w.exercises.length) return;
    // Moving breaks superset links around the moved pair.
    [w.exercises[i], w.exercises[j]] = [w.exercises[j], w.exercises[i]];
    const links = linksOf(w.exercises);
    applyLinks(w.exercises, links);
    saveWorkouts();
    render();
  },
  'ed-restore': () =>
    confirmSheet('Restore original?', 'This replaces your edits to this workout with the original plan.', 'Restore', 'ed-restore-yes'),
  'ed-restore-yes': () => {
    const w = editing();
    const orig = structuredClone(DEFAULT_WORKOUTS.find((d) => d.id === w.id));
    state.workouts[state.workouts.indexOf(w)] = orig;
    saveWorkouts();
    closeSheet();
    render();
  },
  'ed-delete': () => confirmSheet('Delete workout?', 'The workout is removed from your list.', 'Delete', 'ed-delete-yes', { danger: true }),
  'ed-delete-yes': () => {
    const w = editing();
    state.workouts = state.workouts.filter((x) => x !== w);
    if (state.session?.workoutId === w.id) {
      state.session = null;
      persistSession();
    }
    saveWorkouts();
    closeSheet();
    state.editor = null;
    state.screen = 'home';
    render();
  },
};

// Live rename.
export function onEditorInput(el) {
  if (el.dataset.edit !== 'workout-name') return;
  const w = editing();
  if (!w) return;
  w.name = el.value.trim() || 'Untitled workout';
  saveWorkouts();
}
