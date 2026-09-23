import { state, render, persistSession, currentWorkout, saveWorkouts } from '../app/state.js';
import { esc, daysAgo, isIOS, isStandalone, uid } from '../app/util.js';
import { muscleName } from '../data/muscles.js';
import { save } from '../lib/storage.js';
import { doneCount } from '../lib/session.js';
import { keepAwake } from '../lib/device.js';
import { icon } from '../ui/icons.js';
import { libraryHtml, pickTray, bindLibrary } from './library.js';
import { openEditor } from './editor.js';

// Rough session length: ~2.5 min per set including rest.
export function workoutMinutes(w) {
  return Math.round(w.exercises.reduce((n, e) => n + (e.sets || 3) * 2.5, 0) / 5) * 5;
}

export function workoutMuscles(w) {
  return [...new Set(w.exercises.flatMap((e) => e.primary))].map(muscleName);
}

function workoutsHtml() {
  const s = state.session;
  const sw = s && currentWorkout();
  const resume = sw
    ? `<div class="resume">
        <span class="resume-dot" aria-hidden="true"></span>
        <span class="resume-text"><b>${esc(sw.name)}</b> in progress · ${doneCount(s)} of ${s.done.length} done</span>
        <button class="btn btn-text" data-action="discard">Discard</button>
        <button class="btn btn-primary btn-sm" data-action="resume">Resume</button>
      </div>`
    : '';

  const rows = state.workouts
    .map((w) => {
      const n = w.exercises.length;
      const last = state.lastDone[w.id];
      const meta = n ? [`${n} exercise${n === 1 ? '' : 's'}`, `~${workoutMinutes(w)} min`, last ? `last ${daysAgo(last)}` : null].filter(Boolean).join(' · ') : 'No exercises yet';
      return `<button class="wrow" data-action="open-plan" data-id="${w.id}">
        <span class="wrow-body">
          <span class="wrow-name">${esc(w.name)}</span>
          <span class="wrow-meta">${esc(meta)}</span>
          ${n ? `<span class="wrow-muscles">${workoutMuscles(w).slice(0, 5).map(esc).join(' · ')}</span>` : ''}
        </span>
        ${icon.next}
      </button>`;
    })
    .join('');

  return `${resume}
    <div class="wrows">${rows}</div>
    <button class="add-line" data-action="new-workout">${icon.plus}<span>New workout</span></button>`;
}

export function renderHome(app) {
  const lib = state.tab === 'library';
  const install =
    isIOS && !isStandalone && !state.installDismissed
      ? `<div class="install">
          <p>Install: tap ${icon.share} Share, then <b>Add to Home Screen</b>. It opens full screen and works offline.</p>
          <button class="icon-btn sm" data-action="dismiss-install" aria-label="Dismiss">${icon.close}</button>
        </div>`
      : '';

  app.innerHTML = `
    <div class="screen home ${lib && state.picks.length ? 'has-tray' : ''}">
      <header class="home-top">
        <span class="wordmark">Gym Companion</span>
        <button class="icon-btn" data-action="settings" aria-label="Settings">${icon.gear}</button>
      </header>
      ${install}
      <nav class="tabs" role="tablist">
        <button role="tab" aria-selected="${!lib}" class="${lib ? '' : 'is-on'}" data-action="tab" data-tab="workouts">Workouts</button>
        <button role="tab" aria-selected="${lib}" class="${lib ? 'is-on' : ''}" data-action="tab" data-tab="library">Library</button>
      </nav>
      ${lib ? libraryHtml() : workoutsHtml()}
      ${lib ? pickTray() : ''}
    </div>`;
  if (lib) bindLibrary(app);
}

export const homeActions = {
  tab: (el) => {
    state.tab = el.dataset.tab;
    save('tab', state.tab);
    render();
    window.scrollTo(0, 0);
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
  'new-workout': () => {
    const w = { id: uid('w'), name: `Workout ${state.workouts.length + 1}`, exercises: [] };
    state.workouts.push(w);
    saveWorkouts();
    openEditor(w.id);
  },
};
