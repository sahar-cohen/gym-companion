// Workout session flow. Pure functions over a plain session object:
// { workoutId, startedAt, exIndex, done: bool[][], skipped: bool[], rest, finishedAt }

export function newSession(workout) {
  return {
    workoutId: workout.id,
    startedAt: Date.now(),
    exIndex: 0,
    done: workout.exercises.map((e) => Array(e.sets).fill(false)),
    skipped: workout.exercises.map(() => false),
    rest: null,
    finishedAt: null,
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

export const blockOf = (workout, i) => blocks(workout).find((b) => b.includes(i));
export const doneCount = (session, i) => session.done[i].filter(Boolean).length;
export const remaining = (session, i) => session.done[i].length - doneCount(session, i);
export const isComplete = (session, i) => remaining(session, i) === 0;

export function totals(session) {
  const all = session.done.flat();
  return { done: all.filter(Boolean).length, total: all.length };
}

// Next exercise with sets left, after `block`, wrapping to the start.
// Skipped exercises are left alone.
function nextIncomplete(workout, session, block) {
  const n = workout.exercises.length;
  const after = block[block.length - 1];
  for (let k = 1; k <= n; k++) {
    const i = (after + k) % n;
    if (block.includes(i)) continue;
    if (!isComplete(session, i) && !session.skipped[i]) return i;
  }
  return null;
}

// Called after a set of exercise `i` is marked done.
// Returns { next: index | null, rest: boolean }; next === null means finished.
export function afterSet(workout, session, i) {
  const block = blockOf(workout, i);
  session.skipped[i] = false;

  if (block.length > 1) {
    // Superset: A → B → rest → A → B → rest.
    const pos = block.indexOf(i);
    const mine = doneCount(session, i);
    for (const j of block.slice(pos + 1)) {
      if (!isComplete(session, j) && doneCount(session, j) < mine) return { next: j, rest: false };
    }
    const open = block.filter((j) => !isComplete(session, j));
    if (open.length) {
      const least = Math.min(...open.map((j) => doneCount(session, j)));
      return { next: open.find((j) => doneCount(session, j) === least), rest: true };
    }
  } else if (!isComplete(session, i)) {
    return { next: i, rest: true };
  }

  const next = nextIncomplete(workout, session, block);
  return { next, rest: next !== null };
}

// Label like "A1" / "A2" for superset members, or null.
export function supersetLabel(workout, i) {
  const bs = blocks(workout);
  const b = bs.find((x) => x.includes(i));
  if (b.length < 2) return null;
  const letter = String.fromCharCode(65 + bs.filter((x) => x.length > 1).indexOf(b));
  return `${letter}${b.indexOf(i) + 1}`;
}
