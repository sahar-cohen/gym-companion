// Exercise animations. Each is `pose(s)` where s = 0 is the start of the
// concentric phase (stretched) and s = 1 its end (contracted). The player loops
// bottom-hold → concentric → top-hold → eccentric.
//
// Pose: pelvis {pos, rot}, spine/chest/head rotations (deg, YXZ; +x = flex forward),
// hands {L, R}: { p, s, pole } — s: 'w' world, 'c' chest-local, 's' offset from shoulder,
// feet {L, R}: { p (ankle, world), pole (knee direction), pitch (+ = toes down) }.
// World: y up, figure faces +Z, figure's left is +X. Ankles sit 0.08 above the floor.

const DEG = Math.PI / 180;

const lerp = (a, b, s) => a + (b - a) * s;

export function mix(a, b, s) {
  if (typeof a === 'number') return lerp(a, b, s);
  if (Array.isArray(a)) return a.map((v, i) => mix(v, b[i], s));
  if (a && typeof a === 'object') {
    const o = {};
    for (const k of Object.keys(a)) o[k] = k in b ? mix(a[k], b[k], s) : a[k];
    return o;
  }
  return a;
}

const arm = (p, pole = [0, 0, -1], s = 'c') => ({ p, pole, s });
const leg = (p, pole = [0, 0, 1], pitch = 0) => ({ p, pole, pitch });
const flipX = ([x, y, z]) => [-x, y, z];
const mirror = (spec) => ({ ...spec, p: flipX(spec.p), pole: flipX(spec.pole) });
const both = (left) => ({ L: left, R: mirror(left) });

function pose({
  pelvis = [0, 0.99, 0],
  pelvisRot = [0, 0, 0],
  spine = [0, 0, 0],
  chest = [0, 0, 0],
  head = [0, 0, 0],
  hands = both(arm([0.23, -0.28, 0.03])),
  feet = both(leg([0.11, 0.08, 0.02])),
}) {
  return { pelvis: { pos: pelvis, rot: pelvisRot }, spine, chest, head, hands, feet };
}

// Hand position on an arc around the elbow, in the sagittal (YZ) plane,
// relative to the shoulder. upperDir: [y, z] direction shoulder → elbow.
// flex: elbow flexion in degrees (0 = straight).
function forearmArc(upperDir, flex, x = 0) {
  const [uy, uz] = upperDir;
  const n = Math.hypot(uy, uz);
  const a = Math.atan2(uy, uz) + flex * DEG;
  return [
    x,
    (0.29 * uy) / n + 0.26 * Math.sin(a),
    (0.29 * uz) / n + 0.26 * Math.cos(a),
  ];
}

const T = (con = 1.0, top = 0.35, ecc = 1.6, bottom = 0.35) => ({ con, top, ecc, bottom });

export const ANIMATIONS = {
  // Static split-squat style lunge, left leg forward, dumbbell in the right hand.
  'lunge-single-db': {
    label: 'Lunge / split squat, one dumbbell',
    camera: { az: 62, el: 8, dist: 3.4, y: 0.85 },
    timing: T(1.1, 0.3, 1.5, 0.3),
    pose(s) {
      const feet = {
        L: leg([0.11, 0.08, 0.38]),
        R: leg([-0.11, 0.17, -0.42], [0, 0, 1], 45),
      };
      const hands = {
        L: arm([0.23, -0.27, 0.04], [0.2, 0, -1]),
        R: arm([-0.22, -0.29, 0.03], [-0.2, 0, -1]),
      };
      const bottom = pose({ pelvis: [0, 0.6, -0.02], pelvisRot: [7, 0, 0], chest: [-2, 0, 0], feet, hands });
      const top = pose({ pelvis: [0, 0.88, -0.02], pelvisRot: [3, 0, 0], feet, hands });
      return mix(bottom, top, s);
    },
    props: { dumbbells: { R: 'z' } },
  },

  // Hip hinge ~50°, V-handle close to the plates, bar pivots behind.
  't-bar-row': {
    label: 'T-bar row (hip hinge)',
    camera: { az: 90, el: 10, dist: 3.6, y: 0.85 },
    timing: T(0.9, 0.4, 1.5, 0.3),
    pose(s) {
      const base = {
        pelvis: [0, 0.84, -0.14],
        pelvisRot: [42, 0, 0],
        spine: [8, 0, 0],
        chest: [2, 0, 0],
        head: [-18, 0, 0],
        feet: both(leg([0.17, 0.08, 0.02], [0.25, 0, 1])),
      };
      const bottom = pose({
        ...base,
        hands: both(arm([0.06, 0.66, 0.32], [0.3, 0.2, -1], 'w')),
      });
      const top = pose({
        ...base,
        hands: both(arm([0.06, 0.96, 0.17], [0.25, 0.6, -0.8], 'w')),
      });
      return mix(bottom, top, s);
    },
    props: { tbar: { pivot: [0, 0.05, -1.45] } },
  },

  // Low incline (~18°). Elbows ~50° from the torso at the bottom.
  'incline-db-press': {
    label: 'Incline dumbbell press',
    camera: { az: 58, el: 22, dist: 3.4, y: 0.75 },
    timing: T(1.0, 0.3, 1.6, 0.35),
    pose(s) {
      const base = {
        pelvis: [0, 0.57, 0.0],
        pelvisRot: [-72, 0, 0],
        head: [12, 0, 0],
        feet: both(leg([0.25, 0.08, 0.6], [0.15, 0.6, 1])),
      };
      const bottom = pose({
        ...base,
        hands: both(arm([0.3, 0.8, -0.43], [1, -0.7, 0.35], 'w')),
      });
      const top = pose({
        ...base,
        hands: both(arm([0.15, 1.2, -0.34], [1, -0.4, 0.4], 'w')),
      });
      return mix(bottom, top, s);
    },
    props: { dumbbells: { L: 'z', R: 'z' }, inclineBench: true },
  },

  'lateral-raise': {
    label: 'Standing lateral raise',
    camera: { az: 18, el: 8, dist: 3.7, y: 1.0 },
    timing: T(0.9, 0.35, 1.5, 0.3),
    pose(s) {
      const base = { pelvisRot: [3, 0, 0], feet: both(leg([0.12, 0.08, 0.02])) };
      const bottom = pose({ ...base, hands: both(arm([0.25, -0.29, 0.07], [0.3, 0, -1])) });
      const top = pose({ ...base, hands: both(arm([0.71, 0.18, 0.12], [0, 0.6, -1])) });
      return mix(bottom, top, s);
    },
    props: { dumbbells: { L: 'z', R: 'z' } },
  },

  // Seated at the end of a bench, torso ~60° forward.
  'rear-delt-fly-seated': {
    label: 'Seated bent-over rear delt fly',
    camera: { az: 150, el: 30, dist: 3.2, y: 0.7 },
    timing: T(0.9, 0.4, 1.5, 0.3),
    pose(s) {
      const base = {
        pelvis: [0, 0.55, -0.05],
        pelvisRot: [44, 0, 0],
        spine: [10, 0, 0],
        chest: [6, 0, 0],
        head: [-22, 0, 0],
        feet: both(leg([0.21, 0.08, 0.34], [0.2, 0, 1])),
      };
      const bottom = pose({ ...base, hands: both(arm([0.1, 0.34, 0.47], [1, 0.3, 0], 'w')) });
      const top = pose({ ...base, hands: both(arm([0.7, 0.84, 0.38], [0, 1, -0.25], 'w')) });
      return mix(bottom, top, s);
    },
    props: { dumbbells: { L: 'x', R: 'x' }, flatBench: { z: -0.32, length: 0.85 } },
  },

  // Seated machine curl, upper arms on a pad with the shoulder flexed to 90°.
  'machine-curl': {
    label: 'Machine biceps curl',
    camera: { az: 70, el: 12, dist: 3.1, y: 0.95 },
    timing: T(0.9, 0.35, 1.6, 0.3),
    pose(s) {
      const flex = lerp(8, 122, s);
      const upper = [-0.08, 1];
      return pose({
        pelvis: [0, 0.56, -0.02],
        spine: [4, 0, 0],
        feet: both(leg([0.15, 0.08, 0.42])),
        hands: {
          L: arm(forearmArc(upper, flex, 0.0), [0, -1, 0], 's'),
          R: arm(forearmArc(upper, flex, 0.0), [0, -1, 0], 's'),
        },
      });
    },
    props: { curlMachine: true },
  },

  'hanging-knee-raise': {
    label: 'Hanging knee raise',
    camera: { az: 55, el: 6, dist: 5.0, y: 1.2 },
    timing: T(1.0, 0.35, 1.5, 0.35),
    pose(s) {
      const hands = both(arm([0.24, 2.18, 0], [1, 0, -0.3], 'w'));
      const bottom = pose({
        pelvis: [0, 1.13, 0],
        hands,
        feet: both(leg([0.09, 0.23, 0.03], [0, 0, 1], 30)),
      });
      const top = pose({
        pelvis: [0, 1.14, 0.02],
        pelvisRot: [-18, 0, 0],
        spine: [13, 0, 0],
        chest: [4, 0, 0],
        hands,
        feet: both(leg([0.09, 0.7, 0.38], [0, 0.3, 1], 25)),
      });
      return mix(bottom, top, s);
    },
    props: { pullupBar: { y: 2.18 } },
  },

  'captain-knee-raise': {
    label: 'Captain’s chair knee raise',
    camera: { az: 35, el: 8, dist: 4.3, y: 1.05 },
    timing: T(1.0, 0.35, 1.5, 0.35),
    pose(s) {
      const hands = both(arm([0.03, -0.28, 0.26], [0, -0.2, -1], 's'));
      const bottom = pose({
        pelvis: [0, 1.07, -0.07],
        hands,
        feet: both(leg([0.09, 0.17, -0.01], [0, 0, 1], 25)),
      });
      const top = pose({
        pelvis: [0, 1.08, -0.05],
        pelvisRot: [-18, 0, 0],
        spine: [14, 0, 0],
        chest: [4, 0, 0],
        hands,
        feet: both(leg([0.09, 0.63, 0.34], [0, 0.3, 1], 25)),
      });
      return mix(bottom, top, s);
    },
    props: { captainChair: true },
  },

  // Rope at face height; pull to the ears with elbows high and wide.
  'face-pull': {
    label: 'Cable face pull',
    camera: { az: 145, el: 16, dist: 3.8, y: 1.2 },
    timing: T(0.9, 0.45, 1.5, 0.3),
    pose(s) {
      const base = {
        pelvis: [0, 0.98, -0.04],
        pelvisRot: [-6, 0, 0],
        feet: { L: leg([0.12, 0.08, 0.12]), R: leg([-0.12, 0.08, -0.14], [0, 0, 1], 12) },
      };
      const bottom = pose({ ...base, hands: both(arm([0.07, 1.55, 0.44], [1, -0.4, 0], 'w')) });
      const top = pose({ ...base, hands: both(arm([0.22, 1.66, 0.02], [1, 0.15, -0.5], 'w')) });
      return mix(bottom, top, s);
    },
    props: { cable: { from: [0, 1.72, 1.35], column: [0, 0, 1.5], rope: true } },
  },

  // Right arm works; left hand rests on the thigh.
  'single-arm-pulldown': {
    label: 'Single-arm cable pulldown',
    camera: { az: -150, el: 12, dist: 3.8, y: 1.15 },
    timing: T(1.0, 0.4, 1.6, 0.35),
    pose(s) {
      const base = {
        pelvis: [0, 0.55, 0],
        pelvisRot: [-8, 0, 0],
        head: [4, 0, 0],
        feet: both(leg([0.16, 0.08, 0.42])),
      };
      const L = arm([0.16, 0.66, 0.25], [1, 0, -1], 'w');
      const bottom = pose({ ...base, hands: { L, R: arm([-0.25, 1.58, 0.1], [-1, 0, -0.3], 'w') } });
      const top = pose({
        ...base,
        chest: [0, 0, -4],
        hands: { L, R: arm([-0.22, 1.14, 0.06], [-0.4, -1, -0.25], 'w') },
      });
      return mix(bottom, top, s);
    },
    props: { cable: { from: [-0.25, 2.35, 0.25], column: [0, 0, 0.7], hands: ['R'] }, seat: { y: 0.45, kneePad: 0.68 } },
  },

  // Seated on a low bench, feet on the plate. Slight forward reach, tall finish.
  'seated-cable-row': {
    label: 'Seated cable row',
    camera: { az: 90, el: 12, dist: 3.6, y: 0.75 },
    timing: T(0.9, 0.4, 1.6, 0.3),
    pose(s) {
      const feet = both(leg([0.13, 0.3, 0.72], [0.1, 0.5, 1], -55));
      const bottom = pose({
        pelvis: [0, 0.52, 0],
        pelvisRot: [16, 0, 0],
        spine: [6, 0, 0],
        head: [-6, 0, 0],
        feet,
        hands: both(arm([0.07, 0.9, 0.72], [0.3, -0.6, -0.3], 'w')),
      });
      const top = pose({
        pelvis: [0, 0.52, 0],
        pelvisRot: [-4, 0, 0],
        spine: [0, 0, 0],
        feet,
        hands: both(arm([0.09, 0.86, 0.2], [0.25, -0.1, -1], 'w')),
      });
      return mix(bottom, top, s);
    },
    props: { cable: { from: [0, 0.62, 1.05], column: [0, 0, 1.15], vHandle: true }, rowBench: true },
  },

  // Left knee and hand on the bench, right arm rows toward the hip.
  'db-row-bench': {
    label: 'One-arm dumbbell row on bench',
    camera: { az: -90, el: 14, dist: 3.5, y: 0.75 },
    timing: T(0.9, 0.4, 1.5, 0.3),
    pose(s) {
      const base = {
        pelvis: [0, 0.93, -0.08],
        pelvisRot: [78, 0, 0],
        chest: [4, 0, 0],
        head: [-35, 0, 0],
        feet: {
          L: leg([0.16, 0.53, -0.5], [0, -0.3, 1], 80),
          R: leg([-0.26, 0.08, -0.02], [-0.2, 0, 1]),
        },
      };
      const L = arm([0.2, 0.48, 0.46], [0.3, 0, -1], 'w');
      const bottom = pose({ ...base, hands: { L, R: arm([-0.2, 0.47, 0.46], [-0.3, 0, -1], 'w') } });
      const top = pose({ ...base, hands: { L, R: arm([-0.19, 0.92, 0.2], [-0.15, 1, -0.4], 'w') } });
      return mix(bottom, top, s);
    },
    props: { dumbbells: { R: 'z' }, flatBench: { x: 0.18, z: 0.08, length: 1.25, width: 0.34 } },
  },

  // Right arm on a 45° preacher pad; left arm rests on the pad.
  'preacher-curl': {
    label: 'Preacher curl, one arm',
    camera: { az: -70, el: 14, dist: 3.0, y: 0.95 },
    timing: T(0.9, 0.35, 1.7, 0.3),
    pose(s) {
      const upper = [-0.72, 0.7];
      return pose({
        pelvis: [0, 0.6, 0],
        pelvisRot: [8, 0, 0],
        spine: [4, 0, 0],
        head: [-4, 0, 0],
        feet: both(leg([0.16, 0.08, 0.4])),
        hands: {
          L: arm(forearmArc(upper, 30, -0.02), [0, -1, 0], 's'),
          R: arm(forearmArc(upper, lerp(12, 128, s), 0.02), [0, -1, 0], 's'),
        },
      });
    },
    props: { dumbbells: { R: 'x' }, preacher: true },
  },
};

// Neutral standing pose, used for exercises without a demo and the body map.
export const standingPose = () => pose({ hands: both(arm([0.24, -0.29, 0.03], [0.3, 0, -1])) });

// Placeholder for exercises that have no movement demo yet: the figure stands
// still and only the muscle glow pulses.
ANIMATIONS.none = {
  label: 'No demo (muscles only)',
  camera: { az: 25, el: 8, dist: 3.9, y: 0.95 },
  timing: T(1.0, 0.4, 1.2, 0.4),
  pose: standingPose,
  props: {},
};

// Loop phase → { s, glow }. Glow ramps with the concentric phase, peaks at
// the top, and fades quickly through the eccentric.
const smooth = (x) => x * x * (3 - 2 * x);

export function sample(anim, t) {
  const { con, top, ecc, bottom } = anim.timing;
  const cycle = con + top + ecc + bottom;
  let u = t % cycle;
  if (u < bottom) return { s: 0, glow: 0 };
  u -= bottom;
  if (u < con) {
    const s = smooth(u / con);
    return { s, glow: s };
  }
  u -= con;
  if (u < top) return { s: 1, glow: 1 };
  u -= top;
  const p = u / ecc;
  return { s: 1 - smooth(p), glow: (1 - p) ** 2.2 };
}
