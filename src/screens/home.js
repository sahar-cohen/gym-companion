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
    ? `<section class="resume">
        <div>
          <div class="eyebrow">In progress</div>
          <div class="resume-title">${esc(sw.name)} · ${doneCount(s)}/${s.done.length} done</div>
        </div>
        <button class="btn btn-ghost" data-action="discard">Discard</button>
        <button class="btn btn-primary" data-action="resume">Resume</button>
      </section>`
    : '';

  const cards = state.workouts
    .map((w) => {
      const n = w.exercises.length;
      const last = state.lastDone[w.id];
      return `<button class="wcard" data-action="open-plan" data-id="${w.id}">
        <span class="wcard-body">
          <span class="wcard-name">${esc(w.name)}</span>
          ${
            n
              ? `<span class="wcard-meta">${n} exercise${n === 1 ? '' : 's'} · ~${workoutMinutes(w)} min</span>
                 <span class="wcard-muscles">${workoutMuscles(w).slice(0, 6).map(esc).join(' · ')}</span>`
              : `<span class="wcard-meta">No exercises yet</span>`
          }
          ${last ? `<span class="wcard-extra">Last done ${daysAgo(last)}</span>` : ''}
        </span>
        <span class="wcard-go">${icon.next}</span>
      </button>`;
    })
    .join('');

  return `<h1 class="home-title">Today’s<br>workout</h1>
    ${resume}
    <div class="wlist" role="list">${cards}</div>
    <div class="wtools">
      <button class="btn btn-ghost" data-action="new-workout">${icon.plus}<span>New workout</span></button>
    </div>`;
}

export function renderHome(app) {
  const lib = state.tab === 'library';
  const install =
    isIOS && !isStandalone && !state.installDismissed
      ? `<section class="install">
          <div class="install-text"><b>Install on your iPhone</b>
            <span>Tap ${icon.share} Share, then <b>Add to Home Screen</b>. It opens full screen and works offline.</span></div>
          <button class="icon-btn sm" data-action="dismiss-install" aria-label="Dismiss">${icon.close}</button>
        </section>`
      : '';

  app.innerHTML = `
    <div class="screen home">
      <header class="home-top">
        <div class="brand"><span class="brand-mark" aria-hidden="true"></span>Gym Companion</div>
        <button class="icon-btn" data-action="settings" aria-label="Settings">${icon.gear}</button>
      </header>
      ${install}
      <div class="seg-ctl home-tabs" role="tablist">
        <button role="tab" aria-selected="${!lib}" class="${lib ? '' : 'is-on'}" data-action="tab" data-tab="workouts">Workouts</button>
        <button role="tab" aria-selected="${lib}" class="${lib ? 'is-on' : ''}" data-action="tab" data-tab="library">Library</button>
      </div>
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
