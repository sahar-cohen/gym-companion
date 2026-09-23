// Default workouts, built from the exercise library (data/exercises.js).
//
// A workout exercise is a library entry plus a dose:
//   id, name, sets, reps (string, e.g. "8–10"), repsNote ("per leg"),
//   superset (shared group id | null), primary / secondary, cues, avoid,
//   animation, camera, variants, confirm (optional "Confirm with coach" note)
// Workout fields: id, name, exercises

import { fromLibrary as ex } from './exercises.js';

export const WORKOUTS_VERSION = 1;

export const DEFAULT_WORKOUTS = [
  {
    id: 'full-body',
    name: 'Full Body',
    exercises: [
      ex('lunge-db', { sets: 3, reps: '12', repsNote: 'per leg' }),
      ex('t-bar-row', { sets: 3, reps: '10' }),
      ex('incline-db-press', { sets: 3, reps: '12' }),
      ex('lateral-raise', { sets: 3, reps: '10' }, { superset: 'ss-shoulders' }),
      ex('rear-delt-fly', { sets: 3, reps: '12' }, { superset: 'ss-shoulders' }),
      ex('machine-curl', { sets: 3, reps: '8–10' }),
      ex('knee-raise', { sets: 3, reps: '12' }),
    ],
  },
  {
    id: 'pull',
    name: 'Pull',
    exercises: [
      ex('face-pull', { sets: 3, reps: '12' }, { confirm: 'Exact variant unconfirmed. Showing a cable face pull.' }),
      ex('single-arm-pulldown', { sets: 3, reps: '10', repsNote: 'per arm' }),
      ex('seated-cable-row', { sets: 3, reps: '10' }),
      ex('db-row-bench', { sets: 3, reps: '10', repsNote: 'per arm' }, { confirm: 'Exact variant unconfirmed. Showing a one-arm dumbbell row.' }),
      ex('preacher-curl', { sets: 3, reps: '10', repsNote: 'per arm' }),
    ],
  },
  {
    id: 'workout-3',
    name: 'Workout 3',
    exercises: [],
  },
];
