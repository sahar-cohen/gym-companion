import * as THREE from 'three';

// Simple gym equipment built from primitives. buildProps(spec, figure) returns
// { group, update } where update() re-poses the moving parts (cables, bars)
// after the figure has been posed for the current frame.

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 14);
const unitBox = new THREE.BoxGeometry(1, 1, 1);

export const propMats = {
  frame: new THREE.MeshStandardMaterial({ color: 0x5b6068, roughness: 0.5, metalness: 0.3 }),
  pad: new THREE.MeshStandardMaterial({ color: 0x3a3e45, roughness: 0.8 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.35, metalness: 0.6 }),
  cable: new THREE.MeshStandardMaterial({ color: 0x1d1f23, roughness: 0.6 }),
};

export function setPropColors({ frame, pad, metal, cable }) {
  propMats.frame.color.set(frame);
  propMats.pad.color.set(pad);
  propMats.metal.color.set(metal);
  propMats.cable.color.set(cable);
}

function box(mat, [w, h, d], [x, y, z], rotX = 0) {
  const m = new THREE.Mesh(unitBox, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.rotation.x = rotX;
  return m;
}

// A cylinder of `radius` spanning points a → b (updated in place).
function stick(mat, radius) {
  const m = new THREE.Mesh(unitCyl, mat);
  m.userData.r = radius;
  return m;
}
function placeStick(m, a, b) {
  _c.subVectors(b, a);
  const len = _c.length();
  m.position.copy(a).addScaledVector(_c, 0.5);
  m.quaternion.setFromUnitVectors(UP, _c.normalize());
  m.scale.set(m.userData.r, len, m.userData.r);
}
function fixedStick(mat, radius, a, b) {
  const m = stick(mat, radius);
  placeStick(m, new THREE.Vector3(...a), new THREE.Vector3(...b));
  return m;
}

function dumbbell() {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(unitCyl, propMats.metal);
  handle.scale.set(0.014, 0.2, 0.014);
  handle.rotation.z = Math.PI / 2;
  g.add(handle);
  for (const s of [1, -1]) {
    const head = new THREE.Mesh(unitCyl, propMats.metal);
    head.scale.set(0.055, 0.06, 0.055);
    head.rotation.z = Math.PI / 2;
    head.position.x = 0.1 * s;
    g.add(head);
  }
  return g;
}

// Olympic-style bar along local X, centred on the group origin.
function barbell() {
  const g = new THREE.Group();
  const bar = new THREE.Mesh(unitCyl, propMats.metal);
  bar.scale.set(0.014, 1.6, 0.014);
  bar.rotation.z = Math.PI / 2;
  g.add(bar);
  for (const s of [1, -1]) {
    const plate = new THREE.Mesh(unitCyl, propMats.metal);
    plate.scale.set(0.2, 0.045, 0.2);
    plate.rotation.z = Math.PI / 2;
    plate.position.x = 0.6 * s;
    const collar = new THREE.Mesh(unitCyl, propMats.frame);
    collar.scale.set(0.03, 0.03, 0.03);
    collar.rotation.z = Math.PI / 2;
    collar.position.x = 0.56 * s;
    g.add(plate, collar);
  }
  return g;
}

// Palm centre of a hand, in world space.
const PALM = new THREE.Vector3(0, -0.045, 0);

function legs(group, xs, zs, top) {
  for (const x of xs) for (const z of zs) group.add(box(propMats.frame, [0.04, top, 0.04], [x, top / 2, z]));
}

export function buildProps(spec = {}, figure) {
  const group = new THREE.Group();
  const updaters = [];
  const hand = (side, out) => figure.bones[`hand${side}`].getWorldPosition(out);
  const handMid = (out) => {
    hand('L', out);
    hand('R', _b);
    return out.add(_b).multiplyScalar(0.5);
  };

  // Dumbbells attach to the hand bones. Axis: 'x' or 'z' in hand space.
  const attached = [];
  if (spec.dumbbells) {
    for (const [side, axis] of Object.entries(spec.dumbbells)) {
      const db = dumbbell();
      db.position.set(0, -0.04, 0);
      if (axis === 'z') db.rotation.y = Math.PI / 2;
      figure.bones[`hand${side}`].add(db);
      attached.push(db);
    }
  }

  if (spec.flatBench) {
    const { x = 0, z = 0, length = 1.1, width = 0.3 } = spec.flatBench;
    group.add(box(propMats.pad, [width, 0.08, length], [x, 0.41, z]));
    legs(group, [x - width / 2 + 0.04, x + width / 2 - 0.04], [z - length / 2 + 0.08, z + length / 2 - 0.08], 0.37);
  }

  if (spec.inclineBench) {
    // Seat, then a back pad rising ~18° toward -Z.
    group.add(box(propMats.pad, [0.3, 0.08, 0.42], [0, 0.41, 0.17]));
    const ang = 18 * (Math.PI / 180);
    const len = 1.05;
    const pad = box(propMats.pad, [0.3, 0.08, len], [0, 0.41 + Math.sin(ang) * len * 0.5, -0.05 - Math.cos(ang) * len * 0.5], ang);
    group.add(pad);
    legs(group, [-0.11, 0.11], [0.33, -0.95], 0.37);
    group.add(box(propMats.frame, [0.04, 0.2, 0.04], [0, 0.55, -0.9]));
  }

  if (spec.tbar) {
    const pivot = new THREE.Vector3(...spec.tbar.pivot);
    const bar = stick(propMats.metal, 0.018);
    const sleeve = stick(propMats.metal, 0.028);
    const plate = new THREE.Mesh(unitCyl, propMats.metal);
    const vHandle = stick(propMats.metal, 0.014);
    group.add(bar, sleeve, plate, vHandle, box(propMats.frame, [0.14, 0.06, 0.14], [pivot.x, 0.03, pivot.z]));
    const dir = new THREE.Vector3();
    const end = new THREE.Vector3();
    updaters.push(() => {
      handMid(_a);
      dir.subVectors(_a, pivot).normalize();
      end.copy(_a).addScaledVector(dir, 0.08);
      placeStick(bar, pivot, end);
      const sleeveEnd = end.clone().addScaledVector(dir, 0.3);
      placeStick(sleeve, end, sleeveEnd);
      plate.position.copy(end).addScaledVector(dir, 0.1);
      plate.quaternion.setFromUnitVectors(UP, dir);
      plate.scale.set(0.2, 0.05, 0.2);
      hand('L', _b);
      hand('R', _c);
      placeStick(vHandle, _b.clone(), _c.clone());
    });
  }

  if (spec.curlMachine) {
    // Arm pad sits just under the elbows; handle bar joins the hands.
    const elbow = figure.bones.foreArmL.getWorldPosition(new THREE.Vector3());
    const sh = figure.bones.upperArmL.getWorldPosition(new THREE.Vector3());
    const padTop = elbow.y - 0.05;
    group.add(box(propMats.pad, [0.62, 0.07, 0.3], [0, padTop - 0.035, (sh.z + elbow.z) / 2 + 0.03]));
    group.add(box(propMats.frame, [0.08, padTop - 0.07, 0.08], [0, (padTop - 0.07) / 2, elbow.z]));
    group.add(box(propMats.pad, [0.42, 0.08, 0.42], [0, 0.42, -0.02]));
    group.add(box(propMats.frame, [0.08, 0.38, 0.08], [0, 0.19, -0.02]));
    group.add(box(propMats.frame, [0.1, 1.4, 0.1], [0, 0.7, elbow.z + 0.45]));
    const bar = stick(propMats.metal, 0.016);
    group.add(bar);
    updaters.push(() => {
      hand('L', _a).x += 0.08;
      hand('R', _b).x -= 0.08;
      placeStick(bar, _a, _b);
    });
  }

  if (spec.preacher) {
    // Pad under both upper arms, sloped along the upper arm.
    const sh = figure.bones.upperArmR.getWorldPosition(new THREE.Vector3());
    const el = figure.bones.foreArmR.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3().subVectors(el, sh).normalize();
    const normal = new THREE.Vector3(0, dir.z, -dir.y); // perpendicular in YZ, pointing up/back
    if (normal.y < 0) normal.negate();
    const mid = sh.clone().lerp(el, 0.62).addScaledVector(normal, -0.08);
    const pad = box(propMats.pad, [0.6, 0.07, 0.36], [0, mid.y, mid.z]);
    pad.rotation.x = Math.atan2(-dir.y, dir.z);
    group.add(pad);
    group.add(box(propMats.frame, [0.08, mid.y - 0.05, 0.08], [0, (mid.y - 0.05) / 2, mid.z + 0.05]));
    group.add(box(propMats.pad, [0.4, 0.08, 0.36], [0, 0.46, -0.02]));
    group.add(box(propMats.frame, [0.08, 0.42, 0.08], [0, 0.21, -0.02]));
  }

  if (spec.pullupBar) {
    const y = spec.pullupBar.y + 0.02;
    group.add(fixedStick(propMats.metal, 0.018, [-0.6, y, 0], [0.6, y, 0]));
    for (const x of [-0.6, 0.6]) group.add(fixedStick(propMats.frame, 0.03, [x, 0, -0.05], [x, y + 0.08, -0.05]));
  }

  if (spec.captainChair) {
    group.add(box(propMats.pad, [0.36, 0.72, 0.08], [0, 1.2, -0.23]));
    for (const s of [1, -1]) {
      group.add(box(propMats.pad, [0.1, 0.07, 0.48], [0.23 * s, 1.23, 0.04]));
      group.add(fixedStick(propMats.metal, 0.018, [0.23 * s, 1.22, 0.3], [0.23 * s, 1.36, 0.3]));
      group.add(fixedStick(propMats.frame, 0.03, [0.3 * s, 0, -0.28], [0.3 * s, 1.6, -0.28]));
      group.add(fixedStick(propMats.frame, 0.02, [0.3 * s, 1.2, -0.28], [0.23 * s, 1.2, 0.28]));
    }
    group.add(box(propMats.frame, [0.4, 0.05, 0.06], [0, 0.35, -0.28]));
  }

  if (spec.seat) {
    group.add(box(propMats.pad, [0.42, 0.08, 0.4], [0, spec.seat.y - 0.04, -0.02]));
    group.add(box(propMats.frame, [0.08, spec.seat.y - 0.08, 0.08], [0, (spec.seat.y - 0.08) / 2, -0.02]));
    if (spec.seat.kneePad) {
      const kp = new THREE.Mesh(unitCyl, propMats.pad);
      kp.scale.set(0.055, 0.5, 0.055);
      kp.rotation.z = Math.PI / 2;
      kp.position.set(0, spec.seat.kneePad, 0.3);
      group.add(kp, box(propMats.frame, [0.06, spec.seat.kneePad, 0.06], [0, spec.seat.kneePad / 2, 0.4]));
    }
  }

  if (spec.rowBench) {
    group.add(box(propMats.pad, [0.3, 0.1, 1.5], [0, 0.37, 0.15]));
    group.add(box(propMats.frame, [0.08, 0.32, 1.3], [0, 0.16, 0.2]));
    group.add(box(propMats.frame, [0.4, 0.4, 0.05], [0, 0.25, 0.82], -0.35));
  }

  const palm = (side, out) => out.copy(PALM).applyMatrix4(figure.bones[`hand${side}`].matrixWorld);

  // Barbell through both palms (bench, squat, RDL, hip thrust).
  if (spec.barbell) {
    const bb = barbell();
    group.add(bb);
    updaters.push(() => {
      palm('L', _a);
      palm('R', _b);
      bb.position.copy(_a).add(_b).multiplyScalar(0.5);
      _c.subVectors(_a, _b).normalize();
      bb.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), _c);
    });
  }

  // One dumbbell held upright in both hands (overhead extension).
  if (spec.heldDumbbell) {
    const db = dumbbell();
    group.add(db);
    const elbow = new THREE.Vector3();
    updaters.push(() => {
      palm('L', _a);
      palm('R', _b);
      const mid = _a.add(_b).multiplyScalar(0.5);
      figure.bones.foreArmL.getWorldPosition(elbow);
      figure.bones.foreArmR.getWorldPosition(_c);
      elbow.add(_c).multiplyScalar(0.5);
      _c.subVectors(mid, elbow).normalize();
      db.position.copy(mid).addScaledVector(_c, 0.03);
      db.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), _c);
    });
  }

  if (spec.mat) {
    const { z = 0, length = 1.9 } = spec.mat;
    group.add(box(propMats.pad, [0.66, 0.012, length], [0, 0.006, z]));
  }

  if (spec.step) {
    const { z = 0.16, depth = 0.26, h = 0.14 } = spec.step;
    group.add(box(propMats.pad, [0.56, h, depth], [0, h / 2, z]));
  }

  if (spec.uprightBench) {
    group.add(box(propMats.pad, [0.34, 0.08, 0.38], [0, 0.41, 0.02]));
    group.add(box(propMats.pad, [0.3, 0.8, 0.07], [0, 0.88, -0.2], -0.08));
    legs(group, [-0.12, 0.12], [-0.12, 0.16], 0.37);
    group.add(box(propMats.frame, [0.05, 0.5, 0.05], [0, 0.6, -0.26], -0.08));
  }

  // 45° leg press: reclined seat, sled platform that follows the feet.
  if (spec.legPress) {
    const d = new THREE.Vector3(0, Math.SQRT1_2, Math.SQRT1_2);
    group.add(box(propMats.pad, [0.42, 0.08, 0.44], [0, 0.36, 0.02]));
    const back = box(propMats.pad, [0.42, 0.08, 0.8], [0, 0.6, -0.34], 0.87);
    group.add(back);
    group.add(box(propMats.frame, [0.1, 0.32, 0.9], [0, 0.16, -0.2]));
    for (const s of [1, -1]) {
      group.add(fixedStick(propMats.frame, 0.03, [0.34 * s, 0.1, 0.25], [0.34 * s, 1.55, 1.7]));
      group.add(fixedStick(propMats.metal, 0.016, [0.29 * s, 0.4, 0.05], [0.29 * s, 0.4, 0.28]));
    }
    const sled = new THREE.Group();
    sled.add(box(propMats.pad, [0.62, 0.62, 0.05], [0, 0, 0]));
    sled.add(box(propMats.frame, [0.72, 0.1, 0.14], [0, -0.3, 0.08]));
    group.add(sled);
    sled.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
    updaters.push(() => {
      figure.bones.footL.getWorldPosition(_a);
      figure.bones.footR.getWorldPosition(_b);
      sled.position.copy(_a).add(_b).multiplyScalar(0.5).addScaledVector(d, 0.105);
      sled.position.x = 0;
    });
  }

  // Leg extension / seated leg curl: seat, back pad and a roller on the shins.
  if (spec.legMachine) {
    const { curl = false } = spec.legMachine;
    group.add(box(propMats.pad, [0.44, 0.09, 0.5], [0, 0.44, 0.2]));
    group.add(box(propMats.pad, [0.44, 0.7, 0.08], [0, 0.88, -0.12], 0.14));
    group.add(box(propMats.frame, [0.1, 0.4, 0.1], [0, 0.2, 0.2]));
    if (curl) group.add(box(propMats.pad, [0.44, 0.08, 0.16], [0, 0.66, 0.34]));
    const knee = figure.bones.shinL.getWorldPosition(new THREE.Vector3());
    group.add(box(propMats.frame, [0.08, knee.y, 0.08], [0.34, knee.y / 2, knee.z]));
    const roller = new THREE.Mesh(unitCyl, propMats.pad);
    const lever = stick(propMats.frame, 0.02);
    group.add(roller, lever);
    const pivot = new THREE.Vector3(0.34, knee.y, knee.z);
    const n = new THREE.Vector3();
    updaters.push(() => {
      figure.bones.footL.getWorldPosition(_a);
      figure.bones.shinL.getWorldPosition(_b);
      _c.subVectors(_a, _b).normalize(); // shin direction, knee → ankle
      n.set(0, _c.z, -_c.y); // shin normal in YZ; front of shin for extensions
      if (curl) n.negate();
      roller.position.set(0, _a.y, _a.z).addScaledVector(_c, -0.05).addScaledVector(n, 0.09);
      roller.scale.set(0.055, 0.44, 0.055);
      roller.rotation.set(0, 0, Math.PI / 2);
      placeStick(lever, pivot, _b.set(0.34, roller.position.y, roller.position.z));
    });
  }

  // Two cable columns, one handle per hand (cable fly).
  if (spec.cables) {
    for (const { from, column, hand: side } of spec.cables) {
      const pulley = new THREE.Vector3(...from);
      group.add(box(propMats.frame, [0.14, 2.4, 0.14], [column[0], 1.2, column[2]]));
      const wheel = new THREE.Mesh(unitCyl, propMats.metal);
      wheel.scale.set(0.05, 0.03, 0.05);
      wheel.position.copy(pulley);
      group.add(wheel);
      const line = stick(propMats.cable, 0.007);
      group.add(line);
      updaters.push(() => placeStick(line, pulley, palm(side, _a)));
    }
  }

  if (spec.cable) {
    const { from, column, rope, vHandle, bar, hands = ['L', 'R'] } = spec.cable;
    const pulley = new THREE.Vector3(...from);
    group.add(box(propMats.frame, [0.14, 2.4, 0.14], [column[0], 1.2, column[2]]));
    // Arm from column to pulley.
    group.add(fixedStick(propMats.frame, 0.03, [column[0], from[1], column[2]], from));
    const wheel = new THREE.Mesh(unitCyl, propMats.metal);
    wheel.scale.set(0.05, 0.03, 0.05);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.copy(pulley);
    group.add(wheel);
    const main = stick(propMats.cable, 0.007);
    group.add(main);
    const split = hands.length === 2 && !bar ? [stick(propMats.cable, rope ? 0.012 : 0.01), stick(propMats.cable, rope ? 0.012 : 0.01)] : [];
    if (split.length) group.add(...split);
    const knot = new THREE.Vector3();
    if (bar) {
      // Straight bar through both hands, extended past them; the cable meets it in the middle.
      const handle = stick(propMats.metal, 0.014);
      group.add(handle);
      updaters.push(() => {
        palm('L', _a);
        palm('R', _b);
        const mid = knot.copy(_a).add(_b).multiplyScalar(0.5);
        _c.subVectors(_a, _b).normalize().multiplyScalar(bar / 2);
        placeStick(handle, mid.clone().add(_c), mid.clone().sub(_c));
        placeStick(main, pulley, mid);
      });
    }
    updaters.push(() => {
      if (bar) return;
      if (hands.length === 1) {
        hand(hands[0], _a);
        placeStick(main, pulley, _a);
        return;
      }
      handMid(_a);
      // Rope / V-handle splits a little in front of the hands.
      knot.subVectors(pulley, _a).normalize().multiplyScalar(rope ? 0.22 : 0.14).add(_a);
      placeStick(main, pulley, knot);
      placeStick(split[0], knot, hand('L', _b).clone());
      placeStick(split[1], knot, hand('R', _c).clone());
    });
    if (vHandle) {
      const bar = stick(propMats.metal, 0.014);
      group.add(bar);
      updaters.push(() => placeStick(bar, hand('L', _a).clone(), hand('R', _b).clone()));
    }
  }

  return {
    group,
    update() {
      for (const u of updaters) u();
    },
    dispose() {
      for (const db of attached) db.removeFromParent();
    },
  };
}
