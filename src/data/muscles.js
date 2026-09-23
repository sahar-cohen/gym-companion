// Muscle catalogue.
// `parts` place ellipsoid meshes on figure bones. Coordinates are in the bone's
// local frame for the LEFT side; right-side copies mirror x. Limb bones point
// down -Y from their joint, +Z is the front (biceps / quads side), +X is lateral.
// Torso bones: +Y up, +Z front, +X = figure's left.
// part: [bone, [x, y, z], [radiusX, radiusY, radiusZ], rotZdeg?]

export const MUSCLES = {
  quads: {
    name: 'Quads',
    parts: [['thigh', [0.012, -0.2, 0.05], [0.058, 0.16, 0.042]]],
  },
  glutes: {
    name: 'Glutes',
    parts: [['pelvis', [0.075, -0.035, -0.085], [0.08, 0.085, 0.05]]],
  },
  hamstrings: {
    name: 'Hamstrings',
    parts: [['thigh', [0.004, -0.22, -0.048], [0.052, 0.155, 0.038]]],
  },
  adductors: {
    name: 'Adductors',
    parts: [['thigh', [-0.046, -0.12, 0.004], [0.03, 0.12, 0.045]]],
  },
  hipFlexors: {
    name: 'Hip flexors',
    parts: [['pelvis', [0.085, -0.02, 0.085], [0.04, 0.06, 0.03], -20]],
  },
  obliques: {
    name: 'Obliques',
    parts: [['spine', [0.115, 0.1, 0.03], [0.04, 0.1, 0.06]]],
  },
  lowerAbs: {
    name: 'Lower abs',
    parts: [['spine', [0, 0.03, 0.085], [0.075, 0.06, 0.03]]],
    single: true,
  },
  upperChest: {
    name: 'Upper chest',
    parts: [['chest', [0.085, 0.215, 0.1], [0.085, 0.045, 0.035], 8]],
  },
  frontDelts: {
    name: 'Front delts',
    parts: [['upperArm', [0.012, -0.045, 0.045], [0.04, 0.075, 0.03]]],
  },
  sideDelts: {
    name: 'Side delts',
    parts: [['upperArm', [0.048, -0.05, 0.0], [0.03, 0.08, 0.042]]],
  },
  rearDelts: {
    name: 'Rear delts',
    parts: [['upperArm', [0.012, -0.045, -0.045], [0.04, 0.075, 0.03]]],
  },
  upperTraps: {
    name: 'Upper traps',
    parts: [['chest', [0.085, 0.285, -0.03], [0.08, 0.035, 0.05], -18]],
  },
  midTraps: {
    name: 'Mid traps',
    parts: [['chest', [0.075, 0.235, -0.1], [0.075, 0.035, 0.028]]],
  },
  lowerTraps: {
    name: 'Lower traps',
    parts: [['chest', [0.045, 0.07, -0.1], [0.035, 0.085, 0.025], -18]],
  },
  rhomboids: {
    name: 'Rhomboids',
    parts: [['chest', [0.05, 0.17, -0.112], [0.035, 0.055, 0.022], 25]],
  },
  lats: {
    name: 'Lats',
    parts: [
      ['chest', [0.13, 0.08, -0.07], [0.065, 0.14, 0.045], 12],
      ['spine', [0.1, 0.13, -0.06], [0.05, 0.09, 0.04], 6],
    ],
  },
  teresMajor: {
    name: 'Teres major',
    parts: [['chest', [0.155, 0.16, -0.075], [0.035, 0.028, 0.03], -30]],
  },
  rotatorCuff: {
    name: 'Rotator cuff',
    parts: [['chest', [0.115, 0.2, -0.104], [0.045, 0.04, 0.02]]],
  },
  spinalErectors: {
    name: 'Spinal erectors',
    parts: [
      ['spine', [0.035, 0.1, -0.085], [0.028, 0.12, 0.028]],
      ['pelvis', [0.035, 0.05, -0.08], [0.026, 0.05, 0.025]],
    ],
  },
  biceps: {
    name: 'Biceps',
    parts: [['upperArm', [0.0, -0.15, 0.036], [0.033, 0.095, 0.027]]],
  },
  bicepsShort: {
    name: 'Biceps (short head)',
    parts: [['upperArm', [-0.012, -0.15, 0.036], [0.028, 0.095, 0.027]]],
  },
  triceps: {
    name: 'Triceps',
    parts: [['upperArm', [0.0, -0.14, -0.036], [0.034, 0.105, 0.027]]],
  },
  brachialis: {
    name: 'Brachialis',
    parts: [['upperArm', [0.03, -0.215, 0.018], [0.022, 0.05, 0.022]]],
  },
  brachioradialis: {
    name: 'Brachioradialis',
    parts: [['foreArm', [0.026, -0.07, 0.016], [0.022, 0.075, 0.022]]],
  },
};

export const muscleName = (id) => MUSCLES[id]?.name ?? id;
