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

  if (spec.cable) {
    const { from, column, rope, vHandle, hands = ['L', 'R'] } = spec.cable;
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
    const split = hands.length === 2 ? [stick(propMats.cable, rope ? 0.012 : 0.01), stick(propMats.cable, rope ? 0.012 : 0.01)] : [];
    if (split.length) group.add(...split);
    const knot = new THREE.Vector3();
    updaters.push(() => {
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
