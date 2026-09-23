// App state shared by all screens, plus its persistence.
import { DEFAULT_WORKOUTS, WORKOUTS_VERSION } from '../data/workouts.js';
import { load, save, remove } from '../lib/storage.js';

const DEFAULT_SETTINGS = {
  rest: 90,
  sound: true,
  vibrate: true,
  voice: true,
  theme: 'system',
};

function loadWorkouts() {
  const stored = load('workouts', null);
  return stored?.version === WORKOUTS_VERSION && Array.isArray(stored.items) ? stored.items : structuredClone(DEFAULT_WORKOUTS);
}

export const state = {
  workouts: loadWorkouts(),
  settings: { ...DEFAULT_SETTINGS, ...load('settings', {}) },
  restOverrides: load('restOverrides', {}),
  variants: load('variants', {}),
  selectedId: load('selected', 'full-body'),
  session: load('session', null),
  screen: 'home', // home | workout | done | editor
  editor: null, // { workoutId }
  hintSeen: load('hintSeen', false),
  installDismissed: load('installDismissed', false),
  toast: null,
};

let renderFn = () => {};
export const setRender = (fn) => (renderFn = fn);
export const render = () => renderFn();

export const saveSettings = () => save('settings', state.settings);
export const saveWorkouts = () => save('workouts', { version: WORKOUTS_VERSION, items: state.workouts });
export const persistSession = () => (state.session ? save('session', state.session) : remove('session'));

export const workoutById = (id) => state.workouts.find((w) => w.id === id);
export const currentWorkout = () => workoutById(state.session?.workoutId);

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

export const restFor = (ex) => state.restOverrides[ex.id] ?? ex.rest ?? state.settings.rest;

export function validSession(s) {
  const w = s && workoutById(s.workoutId);
  if (!w || s.finishedAt || s.done?.length !== w.exercises.length) return false;
  if (!w.exercises.every((e, i) => s.done[i].length === e.sets)) return false;
  // Sessions saved before weight logging existed get an empty log.
  s.log ??= w.exercises.map((e) => Array(e.sets).fill(null));
  s.draft ??= {};
  return true;
}
