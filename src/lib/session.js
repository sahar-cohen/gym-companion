// Workout session flow. Pure functions over a plain session object:
// { workoutId, workout? (custom workouts only), startedAt, exIndex, done: bool[] }

export function newSession(workout, custom = false) {
  return {
    workoutId: workout.id,
    ...(custom ? { workout } : {}),
    startedAt: Date.now(),
    exIndex: 0,
    done: workout.exercises.map(() => false),
  };
}

// Groups consecutive exercises that share a superset id.
export function blocks(workout) {
  const out = [];
  workout.exercises.forEach((ex, i) => {
    const last = out[out.length - 1];
    if (ex.superset && last && workout.exercises[last[0]].superset === ex.superset) last.push(i);
    else out.push([i]);
  });
  return out;
}

export const doneCount = (session) => session.done.filter(Boolean).length;

// Next exercise not yet done after `i`, wrapping to the start; null when all are done.
export function nextOpen(session, i) {
  const n = session.done.length;
  for (let k = 1; k <= n; k++) {
    const j = (i + k) % n;
    if (!session.done[j]) return j;
  }
  return null;
}

// Label like "A1" / "A2" for superset members, or null.
export function supersetLabel(workout, i) {
  const bs = blocks(workout);
  const b = bs.find((x) => x.includes(i));
  if (b.length < 2) return null;
  const letter = String.fromCharCode(65 + bs.filter((x) => x.length > 1).indexOf(b));
  return `${letter}${b.indexOf(i) + 1}`;
}

// The other members of i's superset, for "go straight into…" hints.
export function supersetPartners(workout, i) {
  const b = blocks(workout).find((x) => x.includes(i));
  return b.length > 1 ? { block: b, pos: b.indexOf(i) } : null;
}
