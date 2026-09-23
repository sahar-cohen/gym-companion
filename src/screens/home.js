import { state, render, persistSession, workoutById, currentWorkout, restFor, saveWorkouts } from '../app/state.js';
import { esc, daysAgo, isIOS, isStandalone, uid } from '../app/util.js';
import { muscleName } from '../data/muscles.js';
import { save } from '../lib/storage.js';
import { totals } from '../lib/session.js';
import { keepAwake } from '../lib/device.js';
import { allHistory } from '../lib/history.js';
import { icon } from '../ui/icons.js';
import { confirmSheet, closeSheet } from '../ui/sheets.js';
import { startWorkout } from './workout.js';
import { openEditor } from './editor.js';

function workoutStats(w) {
  const sets = w.exercises.reduce((n, e) => n + e.sets, 0);
  const restSec = w.exercises.reduce((n, e) => n + e.sets * restFor(e), 0);
  const minutes = Math.round((sets * 45 + restSec) / 60);
  const muscles = [...new Set(w.exercises.flatMap((e) => e.primary))].map(muscleName);
  return { sets, minutes, muscles };
}

export function renderHome(app) {
  const sel = workoutById(state.selectedId) ?? state.workouts[0];
  const s = state.session;
  const sw = s && currentWorkout();
  const recent = allHistory().slice(0, 3);

  const install =
    isIOS && !isStandalone && !state.installDismissed
      ? `<section class="install">
          <div class="install-text"><b>Install on your iPhone</b>
            <span>Tap ${icon.share} Share, then <b>Add to Home Screen</b>. It opens full screen, works offline and keeps your history safe.</span></div>
          <button class="icon-btn sm" data-action="dismiss-install" aria-label="Dismiss">${icon.close}</button>
        </section>`
      : '';

  const resume = sw
    ? `<section class="resume">
        <div>
          <div class="eyebrow">In progress</div>
          <div class="resume-title">${esc(sw.name)} · ${totals(s).done}/${totals(s).total} sets</div>
        </div>
        <button class="btn btn-ghost" data-action="discard">Discard</button>
        <button class="btn btn-primary" data-action="resume">Resume</button>
      </section>`
    : '';

  const cards = state.workouts
    .map((w) => {
      const st = workoutStats(w);
      const on = w.id === sel.id;
      const last = recent.length ? allHistory().find((r) => r.workoutId === w.id) : null;
      return `<button class="wcard ${on ? 'is-on' : ''}" data-action="select" data-id="${w.id}" aria-pressed="${on}">
        <span class="wcard-radio" aria-hidden="true"></span>
        <span class="wcard-body">
          <span class="wcard-name">${esc(w.name)}</span>
          ${
            w.exercises.length
              ? `<span class="wcard-meta">${w.exercises.length} exercise${w.exercises.length === 1 ? '' : 's'} · ${st.sets} sets · ~${st.minutes} min</span>
                 <span class="wcard-muscles">${st.muscles.slice(0, 6).map(esc).join(' · ')}</span>`
              : `<span class="wcard-meta">No exercises yet</span>`
          }
          ${
            last || w.playlist
              ? `<span class="wcard-extra">${last ? `Last done ${daysAgo(last.startedAt)}` : ''}${last && w.playlist ? ' · ' : ''}${
                  w.playlist ? `${icon.music}${esc(w.playlist.name)}` : ''
                }</span>`
              : ''
          }
        </span>
      </button>`;
    })
    .join('');

  const empty = sel.exercises.length === 0;
  const emptyNote = empty
    ? `<div class="empty">
        <div class="empty-title">Add exercises</div>
        <p>${esc(sel.name)} has no exercises yet. Add them from your coach’s plan.</p>
        <button class="btn btn-primary" data-action="edit" data-id="${sel.id}">${icon.plus}<span>Add exercises</span></button>
      </div>`
    : '';

  const recentList = recent.length
    ? `<div class="section-row"><h2 class="section-title">Recent</h2><button class="linkbtn-inline" data-action="history-all">All history</button></div>
       <div class="recent">${recent
         .map((r) => {
           const sets = r.exercises.reduce((n, e) => n + e.sets.length, 0);
           return `<button class="recent-row" data-action="open-summary" data-id="${r.id}">
             <span><b>${esc(r.workoutName)}</b><small>${daysAgo(r.startedAt)} · ${sets} set${sets === 1 ? '' : 's'}</small></span>${icon.next}
           </button>`;
         })
         .join('')}</div>`
    : '';

  app.innerHTML = `
    <div class="screen home">
      <header class="home-top">
        <div class="brand"><span class="brand-mark" aria-hidden="true"></span>Gym Companion</div>
        <button class="icon-btn" data-action="settings" aria-label="Settings">${icon.gear}</button>
      </header>
      ${install}
      <h1 class="home-title">Today’s<br>workout</h1>
      ${resume}
      <div class="wlist" role="list">${cards}</div>
      <div class="wtools">
        ${empty ? '' : `<button class="btn btn-ghost" data-action="edit" data-id="${sel.id}">${icon.edit}<span>Edit ${esc(sel.name)}</span></button>`}
        <button class="btn btn-ghost" data-action="new-workout">${icon.plus}<span>New workout</span></button>
      </div>
      ${emptyNote}
      ${recentList}
      <div class="home-dock">
        <button class="btn btn-primary btn-xl" data-action="start" ${empty ? 'disabled' : ''}>
          ${empty ? 'Add exercises first' : `${icon.play}<span>Start ${esc(sel.name)}</span>`}
        </button>
      </div>
    </div>`;
}

export const homeActions = {
  select: (el) => {
    state.selectedId = el.dataset.id;
    save('selected', state.selectedId);
    render();
  },
  start: () =>
    state.session
      ? confirmSheet('Start over?', 'You have a workout in progress. Starting a new one discards it.', 'Start new', 'start-new')
      : startWorkout(state.selectedId),
  'start-new': () => {
    closeSheet();
    startWorkout(state.selectedId);
  },
  resume: () => {
    state.screen = 'workout';
    keepAwake(true);
    render();
  },
  discard: () => {
    state.session = null;
    persistSession();
    render();
  },
  'dismiss-install': () => {
    state.installDismissed = true;
    save('installDismissed', true);
    render();
  },
  edit: (el) => openEditor(el.dataset.id),
  'new-workout': () => {
    const w = { id: uid('w'), name: `Workout ${state.workouts.length + 1}`, exercises: [] };
    state.workouts.push(w);
    saveWorkouts();
    state.selectedId = w.id;
    save('selected', w.id);
    openEditor(w.id);
  },
};
