// A workout's plan: its exercises in order. Tap one to study it; Start from here.
import { state, render, workoutById } from '../app/state.js';
import { esc, daysAgo } from '../app/util.js';
import { blocks } from '../lib/session.js';
import { icon } from '../ui/icons.js';
import { confirmSheet, closeSheet } from '../ui/sheets.js';
import { workoutMinutes, workoutMuscles } from './home.js';
import { startWorkout } from './workout.js';
import { openEditor } from './editor.js';

const pad2 = (n) => String(n).padStart(2, '0');

export function renderPlan(app) {
  const w = workoutById(state.planId);
  if (!w) {
    state.screen = 'home';
    return render();
  }
  const n = w.exercises.length;
  const last = state.lastDone[w.id];

  const row = (i) => {
    const ex = w.exercises[i];
    return `<button class="ov-row" data-action="plan-ex" data-i="${i}">
      <span class="ov-idx">${i + 1}</span>
      <span class="ov-body"><span class="ov-name">${esc(ex.name)}</span>
        <span class="ov-meta">${ex.sets} × ${esc(ex.reps)}${ex.repsNote ? ` ${esc(ex.repsNote)}` : ''}</span></span>
      ${icon.next}
    </button>`;
  };
  const rows = blocks(w)
    .map((b) => (b.length > 1 ? `<div class="ov-group"><span class="ov-group-label">Superset · no rest between</span>${b.map(row).join('')}</div>` : row(b[0])))
    .join('');

  app.innerHTML = `
    <div class="screen plan">
      <header class="ed-top">
        <button class="icon-btn" data-action="plan-back" aria-label="Back">${icon.back}</button>
        <button class="btn btn-ghost" data-action="edit" data-id="${w.id}">${icon.edit}<span>Edit</span></button>
      </header>
      <h1 class="home-title">${esc(w.name)}</h1>
      <p class="plan-meta">${n ? `${n} exercise${n === 1 ? '' : 's'} · ~${workoutMinutes(w)} min${last ? ` · last done ${daysAgo(last)}` : ''}` : 'No exercises yet'}</p>
      ${n ? `<p class="plan-muscles">${workoutMuscles(w).map(esc).join(' · ')}</p>` : ''}
      ${
        n
          ? `<div class="ov-list">${rows}</div>`
          : `<div class="empty">
              <div class="empty-title">Add exercises</div>
              <p>Pick them from the library or type in your coach’s plan.</p>
              <button class="btn btn-primary" data-action="edit" data-id="${w.id}">${icon.plus}<span>Add exercises</span></button>
            </div>`
      }
      ${n ? `<div class="home-dock"><button class="btn btn-primary btn-xl" data-action="plan-start">${icon.play}<span>Start ${esc(w.name)}</span></button></div>` : ''}
    </div>`;
}

export const planActions = {
  'open-plan': (el) => {
    state.planId = el.dataset.id;
    state.screen = 'plan';
    render();
    window.scrollTo(0, 0);
  },
  'plan-back': () => {
    state.screen = 'home';
    render();
  },
  'plan-ex': (el) => {
    state.detail = { from: 'plan', workoutId: state.planId, index: +el.dataset.i, scroll: window.scrollY };
    state.screen = 'exercise';
    render();
    window.scrollTo(0, 0);
  },
  'plan-start': () =>
    state.session
      ? confirmSheet('Start over?', 'A workout is in progress. Starting this one ends it.', 'Start', 'plan-start-yes')
      : startWorkout(state.planId),
  'plan-start-yes': () => {
    closeSheet();
    startWorkout(state.planId);
  },
  edit: (el) => openEditor(el.dataset.id),
};
