// Completed workouts, stored newest first:
// { id, workoutId, workoutName, startedAt, finishedAt,
//   exercises: [{ id, name, primary, secondary, sets: [{ w, r }] }] }
import { load, save } from './storage.js';

const KEY = 'history';
const MAX = 400;

export const allHistory = () => load(KEY, []);

// Build the history record for a session. Only logged sets count.
export function toRecord(workout, session) {
  return {
    id: `${session.startedAt}`,
    workoutId: workout.id,
    workoutName: workout.name,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    exercises: workout.exercises
      .map((ex, i) => ({
        id: ex.id,
        name: ex.name,
        primary: ex.primary,
        secondary: ex.secondary ?? [],
        sets: session.log[i].filter((x, j) => x && session.done[i][j]),
      }))
      .filter((e) => e.sets.length),
  };
}

export function addRecord(record) {
  const h = allHistory().filter((r) => r.id !== record.id);
  h.unshift(record);
  save(KEY, h.slice(0, MAX));
}

// Most recent logged sets for an exercise: { sets, at } | null
export function lastFor(exId, before = Infinity) {
  for (const r of allHistory()) {
    if (r.startedAt >= before) continue;
    const e = r.exercises.find((x) => x.id === exId);
    if (e?.sets.length) return { sets: e.sets, at: r.startedAt };
  }
  return null;
}

// One point per session: top weight, reps at that weight, volume.
export function seriesFor(exId) {
  const out = [];
  for (const r of allHistory()) {
    const e = r.exercises.find((x) => x.id === exId);
    if (!e?.sets.length) continue;
    const top = e.sets.reduce((a, b) => (b.w > a.w || (b.w === a.w && b.r > a.r) ? b : a));
    out.push({ at: r.startedAt, w: top.w, r: top.r, volume: volume(e.sets), sets: e.sets });
  }
  return out.reverse();
}

export const volume = (sets) => sets.reduce((n, s) => n + (s.w || 0) * (s.r || 0), 0);

// Heaviest weight ever logged before `before`, for PR detection.
export function bestBefore(exId, before) {
  let best = 0;
  for (const r of allHistory()) {
    if (r.startedAt >= before) continue;
    const e = r.exercises.find((x) => x.id === exId);
    for (const s of e?.sets ?? []) best = Math.max(best, s.w || 0);
  }
  return best;
}

// Per-muscle load for a session: primary sets count 1, secondary 0.5.
export function muscleLoad(record) {
  const load = {};
  for (const e of record.exercises) {
    for (const m of e.primary) load[m] = (load[m] ?? 0) + e.sets.length;
    for (const m of e.secondary) load[m] = (load[m] ?? 0) + e.sets.length * 0.5;
  }
  return load;
}
