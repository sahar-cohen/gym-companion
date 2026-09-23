import * as THREE from 'three';
import { MUSCLES } from '../data/muscles.js';

// Segment lengths (metres). The figure faces +Z; its left side is +X.
export const DIM = {
  upperArm: 0.29,
  foreArm: 0.26,
  thigh: 0.44,
  shin: 0.43,
  shoulder: [0.2, 0.24, 0], // in chest space
  hip: [0.095, -0.06, 0], // in pelvis space
};

const DEG = Math.PI / 180;
const SIDES = ['L', 'R'];

const sphereGeo = new THREE.SphereGeometry(1, 28, 18);

function ellipsoid(mat, [rx, ry, rz], [x, y, z] = [0, 0, 0]) {
  const m = new THREE.Mesh(sphereGeo, mat);
  m.scale.set(rx, ry, rz);
  m.position.set(x, y, z);
  return m;
}

function capsule(mat, radius, length) {
  // Hangs from the joint along -Y.
  const geo = new THREE.CapsuleGeometry(radius, Math.max(0.001, length - radius * 0.6), 6, 16);
  const m = new THREE.Mesh(geo, mat);
  m.position.y = -length / 2;
  return m;
}

// Scratch objects for IK.
const _s = new THREE.Vector3();
const _t = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _eul = new THREE.Euler();

export class Figure {
  constructor() {
    this.root = new THREE.Group();
    this.bodyMat = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.62, metalness: 0.02 });
    this.jointMat = new THREE.MeshStandardMaterial({ color: 0xb4b8be, roughness: 0.6, metalness: 0.02 });
    this.primaryMat = new THREE.MeshStandardMaterial({
      color: 0xff4f1f, emissive: 0xff4f1f, emissiveIntensity: 0.4, roughness: 0.45,
    });
    this.secondaryMat = new THREE.MeshStandardMaterial({
      color: 0xffb59a, emissive: 0xff9a74, emissiveIntensity: 0.15, roughness: 0.5,
    });
    this.bones = {};
    this.muscleMeshes = {};
    this.#build();
    this.#buildMuscles();
  }

  #bone(name, parent, pos = [0, 0, 0]) {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(...pos);
    g.rotation.order = 'YXZ';
    parent.add(g);
    this.bones[name] = g;
    return g;
  }

  #build() {
    const B = this.bodyMat;
    const J = this.jointMat;

    const pelvis = this.#bone('pelvis', this.root, [0, 1, 0]);
    pelvis.add(ellipsoid(B, [0.155, 0.105, 0.105], [0, -0.015, 0]));

    const spine = this.#bone('spine', pelvis, [0, 0.08, 0]);
    spine.add(ellipsoid(B, [0.135, 0.14, 0.095], [0, 0.1, 0]));

    const chest = this.#bone('chest', spine, [0, 0.2, 0]);
    chest.add(ellipsoid(B, [0.185, 0.165, 0.112], [0, 0.14, 0]));
    for (const s of [1, -1]) chest.add(ellipsoid(J, [0.058, 0.058, 0.058], [0.2 * s, 0.245, 0]));

    const neck = this.#bone('neck', chest, [0, 0.29, 0]);
    const neckMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.06, 4, 12), B);
    neckMesh.position.y = 0.04;
    neck.add(neckMesh);

    const head = this.#bone('head', neck, [0, 0.08, 0]);
    head.add(ellipsoid(B, [0.092, 0.113, 0.102], [0, 0.1, 0.012]));
    // A small nose-ridge so facing direction reads at a glance.
    head.add(ellipsoid(J, [0.02, 0.03, 0.02], [0, 0.09, 0.105]));

    for (const side of SIDES) {
      const s = side === 'L' ? 1 : -1;
      const ua = this.#bone(`upperArm${side}`, chest, [DIM.shoulder[0] * s, DIM.shoulder[1], 0]);
      ua.add(capsule(B, 0.047, DIM.upperArm));
      const fa = this.#bone(`foreArm${side}`, ua, [0, -DIM.upperArm, 0]);
      fa.add(ellipsoid(J, [0.042, 0.042, 0.042]));
      fa.add(capsule(B, 0.038, DIM.foreArm));
      const hand = this.#bone(`hand${side}`, fa, [0, -DIM.foreArm, 0]);
      hand.add(ellipsoid(J, [0.03, 0.05, 0.042], [0, -0.035, 0]));

      const th = this.#bone(`thigh${side}`, pelvis, [DIM.hip[0] * s, DIM.hip[1], 0]);
      th.add(capsule(B, 0.068, DIM.thigh));
      const sh = this.#bone(`shin${side}`, th, [0, -DIM.thigh, 0]);
      sh.add(ellipsoid(J, [0.056, 0.056, 0.056]));
      sh.add(capsule(B, 0.05, DIM.shin));
      const ft = this.#bone(`foot${side}`, sh, [0, -DIM.shin, 0]);
      ft.add(ellipsoid(J, [0.045, 0.036, 0.115], [0, -0.042, 0.055]));
    }
  }

  #buildMuscles() {
    for (const [id, def] of Object.entries(MUSCLES)) {
      const meshes = [];
      for (const [bone, pos, size, rotZ = 0] of def.parts) {
        const sides = def.single ? [null] : SIDES;
        for (const side of sides) {
          const mirror = side === 'R' ? -1 : 1;
          const boneName = this.bones[bone] ? bone : `${bone}${side}`;
          const parent = this.bones[boneName];
          const m = ellipsoid(this.primaryMat, size, [pos[0] * mirror, pos[1], pos[2]]);
          m.rotation.z = rotZ * DEG * mirror;
          m.visible = false;
          parent.add(m);
          meshes.push(m);
        }
      }
      this.muscleMeshes[id] = meshes;
    }
  }

  setMuscles(primary = [], secondary = []) {
    for (const [id, meshes] of Object.entries(this.muscleMeshes)) {
      const mat = primary.includes(id) ? this.primaryMat : secondary.includes(id) ? this.secondaryMat : null;
      for (const m of meshes) {
        m.visible = !!mat;
        if (mat) m.material = mat;
      }
    }
  }

  // Body map: each muscle tinted by its level in (0, 1]; 0 hides it.
  setMuscleLevels(levels) {
    this.levelMats ??= {};
    const lo = this.secondaryMat.color;
    const hi = this.primaryMat.color;
    for (const [id, meshes] of Object.entries(this.muscleMeshes)) {
      const v = levels[id] ?? 0;
      let mat = null;
      if (v > 0) {
        mat = this.levelMats[id] ??= new THREE.MeshStandardMaterial({ roughness: 0.5 });
        mat.color.copy(lo).lerp(hi, Math.min(1, v));
        mat.emissive.copy(mat.color);
        mat.emissiveIntensity = 0.15 + 0.5 * v;
      }
      for (const m of meshes) {
        m.visible = !!mat;
        if (mat) m.material = mat;
      }
    }
  }

  // g in [0, 1]: 0 = relaxed, 1 = peak contraction.
  setGlow(g) {
    this.primaryMat.emissiveIntensity = 0.28 + 0.95 * g;
    this.secondaryMat.emissiveIntensity = 0.08 + 0.4 * g;
  }

  setColors({ body, joint, primary, secondary }) {
    this.bodyMat.color.set(body);
    this.jointMat.color.set(joint);
    this.primaryMat.color.set(primary);
    this.primaryMat.emissive.set(primary);
    this.secondaryMat.color.set(secondary);
    this.secondaryMat.emissive.set(secondary);
  }

  shoulderWorld(side, out = new THREE.Vector3()) {
    return this.bones[`upperArm${side}`].getWorldPosition(out);
  }

  applyPose(pose) {
    const b = this.bones;
    b.pelvis.position.set(...pose.pelvis.pos);
    setRot(b.pelvis, pose.pelvis.rot);
    setRot(b.spine, pose.spine);
    setRot(b.chest, pose.chest);
    setRot(b.head, pose.head);
    this.root.updateMatrixWorld(true);

    for (const side of SIDES) {
      const h = pose.hands[side];
      this.#resolveTarget(h, side, _t);
      this.#solve(b[`upperArm${side}`], b[`foreArm${side}`], DIM.upperArm, DIM.foreArm, _t, h.pole, -1);

      const f = pose.feet[side];
      _t.set(...f.p);
      this.#solve(b[`thigh${side}`], b[`shin${side}`], DIM.thigh, DIM.shin, _t, f.pole, 1);
      // Foot: world yaw follows the pelvis, pitch from the pose (+ = toes down).
      const yaw = (pose.pelvis.rot[1] + (f.yaw || 0)) * DEG;
      _q.setFromEuler(_eul.set((f.pitch || 0) * DEG, yaw, 0, 'YXZ'));
      const foot = b[`foot${side}`];
      foot.parent.getWorldQuaternion(_pq);
      foot.quaternion.copy(_pq.invert().multiply(_q));
      foot.updateMatrixWorld(true);
    }
  }

  #resolveTarget(h, side, out) {
    out.set(...h.p);
    if (h.s === 'c') this.bones.chest.localToWorld(out);
    else if (h.s === 's') out.add(this.shoulderWorld(side, _s));
    return out;
  }

  // Two-bone IK. Upper and lower bones hang along local -Y. `pole` is the world
  // direction the middle joint (elbow tip / kneecap) points. zSign picks which
  // local Z face looks toward the pole: -1 for arms (triceps side), +1 for legs.
  #solve(upper, lower, L1, L2, target, pole, zSign) {
    upper.getWorldPosition(_s);
    _d.subVectors(target, _s);
    const dist = THREE.MathUtils.clamp(_d.length(), 0.04, (L1 + L2) * 0.999);
    _d.normalize();
    _p.set(...pole);
    _p.addScaledVector(_d, -_p.dot(_d));
    if (_p.lengthSq() < 1e-8) _p.set(0, 0, zSign).addScaledVector(_d, -_d.z * zSign);
    _p.normalize();
    const cosA = THREE.MathUtils.clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1);
    const a = Math.acos(cosA);
    _e.copy(_s).addScaledVector(_d, Math.cos(a) * L1).addScaledVector(_p, Math.sin(a) * L1);

    aim(upper, _y.subVectors(_e, _s).normalize(), _p, zSign);
    const wrist = _t.copy(_s).addScaledVector(_d, dist);
    aim(lower, _y.subVectors(wrist, _e).normalize(), _p, zSign);
  }
}

function setRot(obj, r) {
  obj.rotation.set(r[0] * DEG, r[1] * DEG, r[2] * DEG, 'YXZ');
}

// Orient `bone` so its local -Y runs along `dir` and its local Z faces
// zSign * (pole projected perpendicular to dir).
function aim(bone, dir, pole, zSign) {
  _y.copy(dir).negate();
  _z.copy(pole).addScaledVector(_y, -pole.dot(_y));
  if (_z.lengthSq() < 1e-8) _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
  _z.normalize().multiplyScalar(zSign);
  _x.crossVectors(_y, _z).normalize();
  _z.crossVectors(_x, _y);
  _m.makeBasis(_x, _y, _z);
  _q.setFromRotationMatrix(_m);
  bone.parent.getWorldQuaternion(_pq);
  bone.quaternion.copy(_pq.invert().multiply(_q));
  bone.updateMatrixWorld(true);
}
