// App state shared by all screens, plus its persistence.
import { DEFAULT_WORKOUTS, WORKOUTS_VERSION } from '../data/workouts.js';
import { EXERCISES } from '../data/exercises.js';
import { load, save, remove } from '../lib/storage.js';

const DEFAULT_SETTINGS = {
  voice: true,
  theme: 'system',
};

// Stored workouts are full copies; fill in technique notes added to the
// library since they were saved (e.g. "avoid").
function backfill(workouts) {
  for (const w of workouts) {
    for (const ex of w.exercises) {
      const lib = EXERCISES[ex.id];
      if (!lib) continue;
      ex.avoid ??= lib.avoid;
      if (!ex.cues?.length) ex.cues = lib.cues;
    }
  }
  return workouts;
}

function loadWorkouts() {
  const stored = load('workouts', null);
  const items = stored?.version === WORKOUTS_VERSION && Array.isArray(stored.items) ? stored.items : structuredClone(DEFAULT_WORKOUTS);
  return backfill(items);
}

// v1 logged weight and reps; that's gone. Keep only when each workout was last done.
function migrate() {
  const history = load('history', null);
  if (!history) return load('lastDone', {});
  const lastDone = load('lastDone', {});
  for (const r of history) lastDone[r.workoutId] = Math.max(lastDone[r.workoutId] ?? 0, r.startedAt);
  save('lastDone', lastDone);
  for (const k of ['history', 'restOverrides', 'selected', 'sp.tokens', 'sp.pkce']) remove(k);
  return lastDone;
}

const settings = { ...DEFAULT_SETTINGS, ...load('settings', {}) };
for (const k of Object.keys(settings)) if (!(k in DEFAULT_SETTINGS)) delete settings[k];

export const state = {
  workouts: loadWorkouts(),
  settings,
  variants: load('variants', {}),
  lastDone: migrate(),
  picks: load('picks', []), // library exercise ids for a custom workout
  session: load('session', null),
  screen: 'home', // home | plan | exercise | workout | done | editor
  tab: load('tab', 'workouts'), // home: workouts | library
  libGroup: 'all',
  libQuery: '',
  planId: null, // workout shown on the plan screen
  detail: null, // exercise screen: { id, from: 'library' | 'plan', index }
  editor: null, // { workoutId }
  summary: null,
  hintSeen: load('hintSeen', false),
  installDismissed: load('installDismissed', false),
  toast: null,
};

let renderFn = () => {};
export const setRender = (fn) => (renderFn = fn);
export const render = () => renderFn();

export const saveSettings = () => save('settings', state.settings);
export const saveWorkouts = () => save('workouts', { version: WORKOUTS_VERSION, items: state.workouts });
export const savePicks = () => save('picks', state.picks);
export const persistSession = () => (state.session ? save('session', state.session) : remove('session'));

export const workoutById = (id) => state.workouts.find((w) => w.id === id);
// Custom workouts started from the library live only in the session.
export const currentWorkout = () => state.session?.workout ?? workoutById(state.session?.workoutId);

export function resetWorkouts() {
  state.workouts = structuredClone(DEFAULT_WORKOUTS);
  remove('workouts');
}

// Resolve the active variant (animation + camera) for an exercise.
export function resolve(ex) {
  if (!ex.variants?.length) return ex;
  const v = ex.variants.find((x) => x.id === state.variants[ex.id]) ?? ex.variants[0];
  return { ...ex, animation: v.animation, camera: v.camera, variantId: v.id };
}

export function validSession(s) {
  const w = s && (s.workout ?? workoutById(s.workoutId));
  if (!w || !Array.isArray(s.done) || s.done.length !== w.exercises.length) return false;
  if (!s.done.every((d) => typeof d === 'boolean')) return false; // v1 sessions tracked sets
  return s.exIndex >= 0 && s.exIndex < w.exercises.length;
}
