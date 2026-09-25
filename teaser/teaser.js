// Spot. — 15 s teaser. Everything on screen is a pure function of time:
// window.seek(t) draws the frame at t seconds (render.mjs steps through it).
import * as THREE from 'three';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/barlow-semi-condensed/700.css';
import '@fontsource/barlow-semi-condensed/800.css';
import '@fontsource/barlow-semi-condensed/900.css';
import { Figure } from '../src/three/figure.js';
import { ANIMATIONS, standingPose } from '../src/three/animations.js';
import { buildProps, setPropColors } from '../src/three/props.js';
import { LIBRARY } from '../src/data/exercises.js';
import { FPS, T } from './timeline.js';

// ---------- Maths ----------

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lin = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, s) => a + (b - a) * s;
const eOutExpo = (x) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x));
const eInExpo = (x) => (x <= 0 ? 0 : 2 ** (10 * x - 10));
const eInOutExpo = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2);
const eOutCubic = (x) => 1 - (1 - x) ** 3;
const eInCubic = (x) => x ** 3;
const eInOutCubic = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
const eInOutSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2;
const eOutBack = (x, k = 1.9) => 1 + (k + 1) * (x - 1) ** 3 + k * (x - 1) ** 2;
// Damped spring kick: 0 at t=0, peaks, settles back to 0.
const kick = (t, f = 3, d = 7) => (t <= 0 ? 0 : Math.exp(-d * t) * Math.sin(2 * Math.PI * f * t));
const decay = (t, k = 8) => (t < 0 ? 0 : Math.exp(-k * t));
// Deterministic noise.
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const noise1 = (x) => {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash(i), hash(i + 1), u) * 2 - 1;
};

const C = { ink: '#131417', paper: '#f3f2ee', orange: '#ff4f1f', peach: '#ffab8c', muted: '#62676f' };
const $ = (s) => document.querySelector(s);
const W = 1920;
const H = 1080;
const SW = 960; // CSS stage size
const SH = 540;

// ---------- Exercise data ----------

const byAnim = {};
LIBRARY.forEach((e, i) => {
  byAnim[e.animation] ??= { ...e, index: i + 1 };
  for (const v of e.variants ?? []) byAnim[v.animation] ??= { ...e, index: i + 1 };
});
const TOTAL = LIBRARY.length;

// ---------- 3D ----------

const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.autoClear = false;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, W / H, 0.03, 60);

const hemi = new THREE.HemisphereLight(0xffffff, 0xb9b4aa, 1.6);
const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(2, 4, 3);
const fill = new THREE.DirectionalLight(0xffffff, 0.7);
fill.position.set(-3, 2, -3);
const rim = new THREE.DirectionalLight(0xff5a26, 0);
rim.position.set(-1.5, 2.5, -4);
const rim2 = new THREE.DirectionalLight(0xffc2a8, 0);
rim2.position.set(3, 1.2, -3);
scene.add(hemi, key, fill, rim, rim2);

const figure = new Figure();
scene.add(figure.root);

function radialTex(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const shadowMat = new THREE.MeshBasicMaterial({ map: radialTex([[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false, opacity: 0.3, color: 0x000000 });
const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), shadowMat);
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = 0.003;
scene.add(shadow);

// The "spot": a pool of light and a thin orange ring on the floor, plus a
// volumetric cone from above in the slow-mo act.
const pool = new THREE.Mesh(
  new THREE.CircleGeometry(1.1, 96),
  new THREE.MeshBasicMaterial({ map: radialTex([[0, 'rgba(255,196,170,0.55)'], [0.55, 'rgba(255,120,70,0.18)'], [1, 'rgba(255,90,40,0)']]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
);
pool.rotation.x = -Math.PI / 2;
pool.position.y = 0.002;
const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.64, 128), new THREE.MeshBasicMaterial({ color: 0xff4f1f, transparent: true, depthWrite: false }));
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.004;
const coneMat = new THREE.ShaderMaterial({
  uniforms: { uOpacity: { value: 0 } },
  vertexShader: /* glsl */ `
    varying float vY; varying vec3 vN; varying vec3 vV;
    void main() {
      vY = position.y;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal);
      vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform float uOpacity; varying float vY; varying vec3 vN; varying vec3 vV;
    void main() {
      float h = clamp((vY + 1.9) / 3.8, 0.0, 1.0);      // 0 floor .. 1 apex
      float facing = pow(abs(dot(vN, vV)), 1.6);        // soft edges
      float a = facing * smoothstep(0.0, 0.35, h) * (1.0 - smoothstep(0.75, 1.0, h)) * (0.25 + 0.75 * (1.0 - h));
      vec3 col = mix(vec3(1.0, 0.42, 0.2), vec3(1.0, 0.85, 0.75), h);
      gl_FragColor = vec4(col * a * uOpacity, a * uOpacity * 0.6);
    }`,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
});
const cone = new THREE.Mesh(new THREE.ConeGeometry(0.95, 3.8, 96, 1, true), coneMat);
cone.position.y = 1.9;
scene.add(pool, ring, cone);

const THEMES = {
  dark: {
    colors: { body: '#747a83', joint: '#5d626a', primary: '#ff5a26', secondary: '#c4684a', frame: '#3b3f46', pad: '#26292e', metal: '#a4aab2', cable: '#b7bcc3' },
    hemi: [0xcfd6e6, 0x0d0e10, 0.75], key: 1.9, fill: 0.25, rim: 3.2, rim2: 1.4, emi: [0.35, 1.6], shadow: 0.6,
  },
  light: {
    colors: { body: '#c3c7cd', joint: '#aab0b8', primary: '#ff4f1f', secondary: '#ffab8c', frame: '#7b818a', pad: '#34383e', metal: '#2a2d32', cable: '#1b1d21' },
    hemi: [0xffffff, 0xb9b4aa, 1.6], key: 1.6, fill: 0.7, rim: 0, rim2: 0, emi: [0.3, 1.0], shadow: 0.25,
  },
  onOrange: {
    colors: { body: '#f3f2ee', joint: '#d9d5cc', primary: '#131417', secondary: '#4a2c22', frame: '#131417', pad: '#131417', metal: '#131417', cable: '#131417' },
    hemi: [0xffffff, 0xff9a7a, 1.9], key: 1.5, fill: 0.6, rim: 0, rim2: 0, emi: [0, 0], shadow: 0.35,
  },
};
let themeName = null;
function useTheme(name) {
  if (name === themeName) return;
  themeName = name;
  const th = THEMES[name];
  figure.setColors(th.colors);
  setPropColors(th.colors);
  hemi.color.set(th.hemi[0]);
  hemi.groundColor.set(th.hemi[1]);
  hemi.intensity = th.hemi[2];
  key.intensity = th.key;
  fill.intensity = th.fill;
  rim.intensity = th.rim;
  rim2.intensity = th.rim2;
  shadowMat.opacity = th.shadow;
}

let animId = null;
let props = null;
let anim = null;
function useAnim(id) {
  if (id === animId) return;
  animId = id;
  anim = ANIMATIONS[id];
  if (props) {
    props.dispose();
    scene.remove(props.group);
  }
  figure.applyPose(anim.pose(0));
  props = buildProps(anim.props, figure);
  scene.add(props.group);
  const ex = byAnim[id];
  figure.setMuscles(ex?.primary ?? [], ex?.secondary ?? []);
}

// ---------- Post: motion blur (sub-frame accumulation + sub-pixel jitter), warm bloom ----------

const rtHalf = { type: THREE.HalfFloatType, format: THREE.RGBAFormat };
const sceneRT = new THREE.WebGLRenderTarget(W, H, { ...rtHalf, depthBuffer: true });
const accumRT = new THREE.WebGLRenderTarget(W, H, { ...rtHalf, depthBuffer: false });
const BW = W / 4;
const BH = H / 4;
const bloomA = new THREE.WebGLRenderTarget(BW, BH, { ...rtHalf, depthBuffer: false });
const bloomB = new THREE.WebGLRenderTarget(BW, BH, { ...rtHalf, depthBuffer: false });
for (const rt of [sceneRT, accumRT, bloomA, bloomB]) rt.texture.minFilter = rt.texture.magFilter = THREE.LinearFilter;

const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quadScene = new THREE.Scene();
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
quad.frustumCulled = false;
quadScene.add(quad);
const VS = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const shader = (fragmentShader, uniforms, extra = {}) =>
  new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false, ...extra });

const accumMat = shader(
  /* glsl */ `uniform sampler2D tex; uniform float w; varying vec2 vUv;
  void main() { gl_FragColor = texture2D(tex, vUv) * w; }`,
  { tex: { value: null }, w: { value: 1 } },
  { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor },
);
const brightMat = shader(
  /* glsl */ `uniform sampler2D tex; uniform vec2 px; varying vec2 vUv;
  vec3 warm(vec2 uv) {
    vec3 c = texture2D(tex, uv).rgb;
    float m = smoothstep(0.2, 0.85, c.r - c.b) * smoothstep(0.25, 0.9, c.r);
    return c * m;
  }
  void main() {
    vec3 c = warm(vUv + px * vec2(-1.0, -1.0)) + warm(vUv + px * vec2(1.0, -1.0)) + warm(vUv + px * vec2(-1.0, 1.0)) + warm(vUv + px * vec2(1.0, 1.0));
    gl_FragColor = vec4(c * 0.25, 1.0);
  }`,
  { tex: { value: null }, px: { value: new THREE.Vector2(1 / W, 1 / H) } },
);
const blurMat = shader(
  /* glsl */ `uniform sampler2D tex; uniform vec2 dir; varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tex, vUv).rgb * 0.2270;
    c += (texture2D(tex, vUv + dir * 1.3846).rgb + texture2D(tex, vUv - dir * 1.3846).rgb) * 0.3162;
    c += (texture2D(tex, vUv + dir * 3.2308).rgb + texture2D(tex, vUv - dir * 3.2308).rgb) * 0.0703;
    gl_FragColor = vec4(c, 1.0);
  }`,
  { tex: { value: null }, dir: { value: new THREE.Vector2() } },
);
const compMat = shader(
  /* glsl */ `uniform sampler2D tex; uniform sampler2D bloom; uniform float strength; uniform float ca; varying vec2 vUv;
  void main() {
    vec4 c = texture2D(tex, vUv);
    if (ca > 0.0) {
      vec2 d = (vUv - 0.5) * ca;
      vec4 r = texture2D(tex, vUv + d);
      vec4 b = texture2D(tex, vUv - d);
      c = vec4(r.r, c.g, b.b, max(c.a, max(r.a, b.a)));
    }
    vec3 g = texture2D(bloom, vUv).rgb * strength;
    vec3 col = c.rgb + g;
    float a = clamp(c.a + max(g.r, max(g.g, g.b)) * 0.8, 0.0, 1.0);
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }`,
  { tex: { value: accumRT.texture }, bloom: { value: bloomA.texture }, strength: { value: 1 }, ca: { value: 0 } },
);

function pass(mat, target, clear = true) {
  quad.material = mat;
  renderer.setRenderTarget(target);
  if (clear) renderer.clear();
  renderer.render(quadScene, quadCam);
}

// Halton(2,3) sub-pixel jitter doubles as anti-aliasing.
const halton = (i, b) => {
  let f = 1;
  let r = 0;
  while (i > 0) {
    f /= b;
    r += f * (i % b);
    i = Math.floor(i / b);
  }
  return r;
};
const SUB = 8;
const JIT = Array.from({ length: SUB }, (_, i) => [halton(i + 1, 2) - 0.5, halton(i + 1, 3) - 0.5]);

const DEG = Math.PI / 180;
const _v = new THREE.Vector3();
const _tgt = new THREE.Vector3();

function placeCamera(c, jitter = [0, 0]) {
  const { az, el, dist, y, fov = 30, shift = 0, lift = 0, roll = 0, tx = 0, tz = 0, shake = 0, seed = 0, time = 0 } = c;
  _tgt.set(tx, y, tz);
  camera.position.set(
    _tgt.x + dist * Math.sin(az * DEG) * Math.cos(el * DEG),
    _tgt.y + dist * Math.sin(el * DEG),
    _tgt.z + dist * Math.cos(az * DEG) * Math.cos(el * DEG),
  );
  if (shake) {
    const s = shake * dist * 0.012;
    camera.position.x += noise1(time * 38 + seed) * s;
    camera.position.y += noise1(time * 41 + seed + 50) * s;
    _tgt.x += noise1(time * 36 + seed + 90) * s * 0.5;
  }
  camera.up.set(Math.sin(roll * DEG), Math.cos(roll * DEG), 0);
  camera.lookAt(_tgt);
  camera.fov = fov;
  camera.updateProjectionMatrix();
  // Lens shift puts the figure off-centre without perspective change.
  camera.setViewOffset(W, H, -shift * W + jitter[0], -lift * H + jitter[1], W, H);
}

function screenOf(obj, out = { x: 0, y: 0 }) {
  obj.getWorldPosition(_v);
  _v.project(camera);
  out.x = ((_v.x + 1) / 2) * SW;
  out.y = ((1 - _v.y) / 2) * SH;
  out.z = _v.z;
  return out;
}
const muscleMesh = (id, side = 0) => figure.muscleMeshes[id]?.[side];

// ---------- Shots ----------
// Each shot: t0, t1, anim, theme, bg, s(lt) → pose phase, glow(lt), cam(lt).

const rise = (lt, a, b, s0 = 0.08) => lerp(s0, 1, eOutCubic(lin(lt, a, b)));
const peakFlash = (lt, at) => (lt >= at ? decay(lt - at, 7) : 0);

const montage = [
  { anim: 'pull-up', bg: 'ink', word: 'EVERY', layout: 'right', cam: (lt) => ({ az: 165 + 30 * lt, el: -9, dist: 4.5 - 0.6 * lt, y: 1.45, shift: -0.2 }) },
  { anim: 'bench-press', bg: 'orange', word: 'REP.', layout: 'behind', cam: (lt) => ({ az: 38 + 26 * lt, el: 30, dist: 3.3 - 0.4 * lt, y: 0.55 }) },
  { anim: 'romanian-deadlift', bg: 'paper', word: 'EVERY', layout: 'left', cam: (lt) => ({ az: 96 - 16 * lt, el: 3, dist: 4.1 - 0.5 * lt, y: 0.92, shift: 0.2 }) },
  { anim: 'lateral-raise', bg: 'ink', word: 'ANGLE.', layout: 'behind', whip: true, cam: (lt) => ({ az: -70 + 180 * eInOutCubic(clamp(lt / 0.5)), el: 6, dist: 3.7, y: 1.02 }) },
  { anim: 'overhead-press', bg: 'orange', word: 'EVERY', layout: 'right', cam: (lt) => ({ az: 18 + 22 * lt, el: -6, dist: 4.0 - 0.5 * lt, y: 1.0, shift: -0.2 }) },
  { anim: 'lunge-single-db', bg: 'paper', word: 'MUSCLE.', layout: 'behind', cam: (lt) => ({ az: 70 - 30 * lt, el: 7, dist: 3.9 - 0.5 * lt, y: 0.86 }) },
];
const stutterAnims = ['push-up', 'face-pull', 'hip-thrust', 'hammer-curl', 't-bar-row', 'cable-fly', 'calf-raise', 'lat-pulldown'];
const stutterBg = ['orange', 'ink', 'paper', 'ink', 'orange', 'ink', 'paper', 'orange'];

const themeFor = { ink: 'dark', paper: 'light', orange: 'onOrange' };

const SHOTS = [];
// Act 2: the figure appears inside the burst of spots and squats.
SHOTS.push({
  t0: T.burst, t1: T.montage, anim: 'back-squat', bg: 'ink', floor: true,
  s: (lt) => {
    if (lt < 0.75) return 1;
    if (lt < 1.15) return 1 - eInOutSine(lin(lt, 0.75, 1.15));
    return eOutCubic(lin(lt, 1.15, 1.5));
  },
  glow: (lt) => 0.55 + 0.45 * peakFlash(lt, 1.5) + 0.25 * clamp(lt - 1.2),
  cam: (lt) => ({ az: 22 + 22 * eInOutSine(lt / 2), el: 5, dist: 4.7 - 0.6 * eInOutSine(lt / 2), y: 0.98 }),
});
montage.forEach((m, i) => {
  SHOTS.push({
    t0: T.cuts[i], t1: T.cuts[i] + 0.5, ...m,
    s: (lt) => rise(lt, 0, 0.26),
    glow: (lt) => rise(lt, 0, 0.26, 0) ** 2 + 0.9 * peakFlash(lt, 0.26),
    shutter: m.whip ? 1 / 45 : 1 / 100,
    montage: i,
  });
});
stutterAnims.forEach((a, i) => {
  const t0 = T.stutter + i * 0.125;
  const base = ANIMATIONS[a].camera;
  SHOTS.push({
    t0, t1: i === 7 ? T.gap : t0 + 0.125, anim: a, bg: stutterBg[i], stutter: i,
    s: (lt) => 0.75 + 0.25 * eOutCubic(lin(lt, 0, 0.1)),
    glow: (lt) => 1 + 0.6 * decay(lt, 20),
    cam: (lt) => ({ az: base.az + (i % 2 ? 22 : -22) + 40 * lt, el: base.el, dist: base.dist * (0.92 - 0.3 * lt), y: base.y, shake: 1.2, seed: i * 13 }),
  });
});
// Act 4: slow-mo squat under a spotlight, then a dolly into the quad.
SHOTS.push({
  t0: T.slowmo, t1: T.iris[0], anim: 'back-squat', bg: 'ink', floor: true, cone: true, slowmo: true,
  s: (lt) => {
    if (lt < 0.35) return 1;
    if (lt < 1.8) return 1 - eInOutSine(lin(lt, 0.35, 1.8));
    if (lt < 2.05) return 0;
    return eInOutCubic(lin(lt, 2.05, 3.0));
  },
  glow: (lt) => 0.45 + 0.55 * eInOutCubic(lin(lt, 2.05, 3.0)) + 0.8 * peakFlash(lt, 3.0) + 2.5 * eInExpo(lin(lt, 2.9, 3.5)),
  cam: (lt) => {
    const orbit = eInOutSine(clamp(lt / 3.2));
    const base = { az: -38 + 118 * orbit, el: 3 + 9 * orbit, dist: 4.5 - 0.5 * orbit, y: 0.98, shift: 0.15 };
    const d = eInCubic(lin(lt, 2.7, 3.5));
    if (d <= 0) return base;
    // Dolly: retarget onto the left quad and fly in.
    const q = muscleMesh('quads', 0).getWorldPosition(new THREE.Vector3());
    return { ...base, tx: q.x * d, y: lerp(base.y, q.y, d), tz: q.z * d, dist: lerp(base.dist, 0.28, d), shift: lerp(base.shift, 0, d), fov: lerp(30, 22, d) };
  },
});

const shotAt = (t) => SHOTS.find((s) => t >= s.t0 && t < s.t1) ?? null;

function poseShot(shot, t) {
  const lt = t - shot.t0;
  useAnim(shot.anim);
  const s = clamp(shot.s(lt));
  figure.applyPose(anim.pose(s));
  props.update();
  const th = THEMES[themeFor[shot.bg]];
  const g = shot.glow(lt);
  figure.primaryMat.emissiveIntensity = th.emi[0] + th.emi[1] * g;
  figure.secondaryMat.emissiveIntensity = (th.emi[0] + th.emi[1] * g) * 0.3;
  const p = figure.bones.pelvis.position;
  shadow.position.x = p.x;
  shadow.position.z = p.z;
  return { ...shot.cam(lt), time: t };
}

function render3D(t) {
  const shot = shotAt(t);
  canvas.style.visibility = shot ? 'visible' : 'hidden';
  if (!shot) return null;
  useTheme(themeFor[shot.bg]);
  pool.visible = ring.visible = !!shot.floor;
  cone.visible = !!shot.cone;
  const lt = t - shot.t0;
  if (shot.cone) coneMat.uniforms.uOpacity.value = 0.55 * lin(lt, 0, 0.6) * (1 - lin(lt, 2.6, 3.1));
  pool.material.opacity = shot.cone ? 1 : 0.5;
  ring.material.opacity = shot.slowmo ? 0.9 * (1 - lin(lt, 2.6, 3.0)) : 0.8 * lin(t, T.reveal, T.reveal + 0.4);

  const shutter = shot.shutter ?? 1 / 110;
  renderer.setRenderTarget(accumRT);
  renderer.clear();
  accumMat.uniforms.w.value = 1 / SUB;
  for (let k = 0; k < SUB; k++) {
    // Keep sub-frames inside the shot so cuts stay crisp.
    const tk = clamp(t + ((k + 0.5) / SUB - 0.5) * shutter, shot.t0, shot.t1 - 1e-4);
    placeCamera(poseShot(shot, tk), JIT[k]);
    renderer.setRenderTarget(sceneRT);
    renderer.clear();
    renderer.render(scene, camera);
    accumMat.uniforms.tex.value = sceneRT.texture;
    pass(accumMat, accumRT, false);
  }
  // Leave the scene posed at t for the HUD projection.
  placeCamera(poseShot(shot, t));
  camera.clearViewOffset();
  const c = shot.cam(lt);
  camera.setViewOffset(W, H, -(c.shift ?? 0) * W, 0, W, H);

  brightMat.uniforms.tex.value = accumRT.texture;
  brightMat.uniforms.px.value.set(2 / W, 2 / H);
  pass(brightMat, bloomA);
  for (const r of [1, 2.2]) {
    blurMat.uniforms.tex.value = bloomA.texture;
    blurMat.uniforms.dir.value.set(r / BW, 0);
    pass(blurMat, bloomB);
    blurMat.uniforms.tex.value = bloomB.texture;
    blurMat.uniforms.dir.value.set(0, r / BH);
    pass(blurMat, bloomA);
  }
  let strength = themeFor[shot.bg] === 'dark' ? 1.4 : 0.7;
  if (shot.slowmo) strength += 3 * eInExpo(lin(lt, 2.8, 3.5));
  compMat.uniforms.strength.value = strength;
  const hit = shot.montage !== undefined ? decay(lt, 14) : shot.stutter !== undefined ? decay(lt, 30) * 0.6 : 0;
  compMat.uniforms.ca.value = 0.012 * hit + (shot.slowmo ? 0.01 * eInExpo(lin(lt, 2.9, 3.5)) : 0);
  pass(compMat, null);
  return { shot, lt };
}

// ---------- DOM layers ----------

const bg = $('#bg');
const halo = $('#halo');
const back = $('#back');
const front = $('#front');
const fx = $('#fx');
const hud = $('#hud');
const dot = $('#dot');
const flash = $('#flash');
const vignette = $('#vignette');
const logo = $('#logo');
const grain = $('#grain');
const hudTL = $('.hud-tl');
const hudTR = $('.hud-tr');
const hudBL = $('.hud-bl');
const hudBR = $('.hud-br');

const BG = { ink: C.ink, paper: C.paper, orange: C.orange };
const INK_ON = { ink: C.paper, paper: C.ink, orange: C.ink };
const WORD_ON = { ink: C.paper, paper: C.orange, orange: C.ink };

function el(tag, cls, parent, html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.innerHTML = html;
  parent.appendChild(e);
  return e;
}

// Montage words: the word, plus an outlined "stamp" echo that flies off it.
const words = montage.map((m) => {
  const parent = m.layout === 'behind' ? back : front;
  const w = el('div', 'word-el', parent, m.word);
  const echo = el('div', 'word-el', parent, m.word);
  return { w, echo, m };
});

// Big outlined FORM behind the first squat.
const formWord = el('div', 'word-el', back, 'FORM');

// Slow-mo cues (real cues from the back squat entry, trimmed).
const CUES = ['Brace before each rep.', 'Knees follow the toes.', 'Sit to parallel. Drive.'];
const cueEls = CUES.map((_, i) => el('div', 'cue', front, `<span class="n">0${i + 1}</span><span class="txt"></span><span class="caret"></span>`));
const RING_IDS = [
  ['quads', 'Quads'],
  ['glutes', 'Glutes'],
  ['adductors', 'Adductors'],
];

function layoutWords() {
  for (const { w, echo, m } of words) {
    const size = m.layout === 'behind' ? 1 : 0.32;
    // Fit behind-words to ~94% of the width, side words to ~40%.
    w.style.fontSize = '100px';
    const natural = w.offsetWidth;
    const target = m.layout === 'behind' ? SW * 0.94 : SW * 0.42;
    const fs = Math.min((100 * target) / natural, m.layout === 'behind' ? 420 : 170);
    for (const e of [w, echo]) e.style.fontSize = `${fs}px`;
    const bw = w.offsetWidth;
    const bh = w.offsetHeight;
    const x = m.layout === 'behind' ? (SW - bw) / 2 : m.layout === 'right' ? SW - bw - 58 : 58;
    const y = m.layout === 'behind' ? (SH - bh) / 2 + 6 : SH - bh - 66;
    for (const e of [w, echo]) {
      e.style.left = `${x}px`;
      e.style.top = `${y}px`;
    }
    void size;
  }
  formWord.style.fontSize = '100px';
  const fs = (100 * SW * 1.0) / formWord.offsetWidth;
  formWord.style.fontSize = `${fs}px`;
  formWord.style.left = `${(SW - formWord.offsetWidth) / 2}px`;
  formWord.style.top = `${(SH - formWord.offsetHeight) / 2 + 10}px`;
}

// Logo geometry, measured once fonts are in.
const L = {};
function layoutLogo() {
  logo.style.display = 'block';
  const word = logo.querySelector('.word');
  const tag = logo.querySelector('.tag');
  const ww = word.offsetWidth;
  const wh = word.offsetHeight;
  const th = tag.offsetHeight;
  const gap = 4;
  const top = (SH - (wh + gap + th)) / 2 - 8;
  word.style.left = `${(SW - ww) / 2}px`;
  word.style.top = `${top}px`;
  tag.style.left = `${(SW - tag.offsetWidth) / 2 + 4}px`;
  tag.style.top = `${top + wh + gap}px`;
  const slot = logo.querySelector('.stop-slot');
  const r = slot.getBoundingClientRect();
  const sr = $('#stage').getBoundingClientRect();
  L.stopX = r.left - sr.left + r.width / 2;
  L.stopY = r.top - sr.top + r.height / 2;
  L.stopD = r.width;
  logo.style.display = 'none';
}

// Film grain: a few pre-baked noise plates, picked per frame.
const plates = [];
function bakeGrain() {
  for (let p = 0; p < 6; p++) {
    const c = document.createElement('canvas');
    c.width = SW;
    c.height = SH;
    const g = c.getContext('2d');
    const img = g.createImageData(SW, SH);
    let seed = 1234 + p * 999;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (rnd() + rnd() + rnd() - 1.5) * 120;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    plates.push(c);
  }
}
const gctx = grain.getContext('2d');

// ---------- Frame ----------

const tc = (t) => {
  const f = Math.floor(t * FPS + 1e-6);
  const s = Math.floor(f / FPS);
  const pad = (n) => String(n).padStart(2, '0');
  return `00:00:${pad(s)}:${pad(f % FPS)}`;
};

function bgAt(t, shot) {
  if (t >= T.impact - 0.5 && t >= T.iris[0]) return 'paper';
  if (shot) return shot.bg;
  return 'ink';
}

function seek(t) {
  // Reset transient layers.
  fx.innerHTML = '';
  flash.style.opacity = 0;
  flash.style.background = C.paper;
  dot.style.opacity = 0;
  dot.style.boxShadow = 'none';
  halo.style.opacity = 0;
  logo.style.display = 'none';
  for (const { w, echo } of words) w.style.display = echo.style.display = 'none';
  formWord.style.display = 'none';
  for (const c of cueEls) c.style.display = 'none';
  canvas.style.clipPath = 'none';
  canvas.style.opacity = 1;

  const r3 = render3D(t);
  const shot = r3?.shot ?? null;
  const lt = r3?.lt ?? 0;
  const bgName = bgAt(t, shot);
  bg.style.background = t >= T.iris[0] ? C.paper : BG[bgName];
  const ink = INK_ON[bgName];
  vignette.style.opacity = bgName === 'ink' ? 1 : bgName === 'orange' ? 0.25 : 0.12;

  let svg = '';

  // ----- Act 1: a single spot, a heartbeat, a charge -----
  if (t < T.burst) {
    const pop = eOutBack(lin(t, T.dotPop, T.dotPop + 0.28), 2.4);
    let scale = 0.16 * pop;
    for (const p of T.pulses) scale *= 1 + 0.55 * kick(t - p, 2.2, 7) + 0.25 * decay(t - p, 18) * (t >= p ? 1 : 0);
    const charge = lin(t, T.charge[0], T.charge[1]);
    scale *= 1 + 0.9 * eInCubic(lin(t, 1.2, 1.86));
    scale *= 1 - 0.75 * eInExpo(lin(t, 1.86, 2.0));
    const jit = 5 * eInCubic(charge);
    const x = SW / 2 + noise1(t * 60) * jit;
    const y = SH / 2 + noise1(t * 60 + 40) * jit;
    dot.style.opacity = t >= T.dotPop ? 1 : 0;
    dot.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    dot.style.boxShadow = `0 0 ${40 + 60 * charge}px ${10 + 20 * charge}px rgba(255,79,31,${0.35 + 0.4 * charge})`;
    // Sonar rings on each pulse.
    for (const p of [T.dotPop, ...T.pulses]) {
      const u = lin(t, p, p + 0.9);
      if (u <= 0 || u >= 1) continue;
      svg += `<circle cx="${x}" cy="${y}" r="${10 + 230 * eOutExpo(u)}" fill="none" stroke="${C.orange}" stroke-width="${1.5 * (1 - u) + 0.3}" opacity="${0.7 * (1 - u)}"/>`;
    }
    // Energy converging on the dot.
    if (charge > 0) {
      for (let i = 0; i < 64; i++) {
        const st = T.charge[0] + hash(i) * 0.85;
        const u = lin(t, st, st + 0.32);
        if (u <= 0 || u >= 1) continue;
        const a = hash(i + 100) * Math.PI * 2;
        const R = 520 + 200 * hash(i + 7);
        const r0 = R * (1 - eInCubic(u));
        const len = 30 + 90 * eInCubic(u);
        const r1 = Math.max(6, r0 - len);
        svg += `<line x1="${x + Math.cos(a) * r0}" y1="${y + Math.sin(a) * r0}" x2="${x + Math.cos(a) * r1}" y2="${y + Math.sin(a) * r1}" stroke="${i % 5 ? C.paper : C.orange}" stroke-width="${i % 5 ? 1 : 1.6}" opacity="${0.5 * Math.sin(Math.PI * u)}" stroke-linecap="round"/>`;
      }
    }
    halo.style.opacity = 0.9 * charge;
    halo.style.background = `radial-gradient(circle at 50% 50%, rgba(255,79,31,${0.28 * eInCubic(charge)}) 0%, transparent 45%)`;
  }

  // ----- Act 2: spots fly out to the muscles, the body appears -----
  if (t >= T.burst && t < T.montage) {
    const u = t - T.burst;
    // Shockwave.
    const sw = lin(u, 0, 0.55);
    if (sw < 1) {
      svg += `<circle cx="${SW / 2}" cy="${SH / 2}" r="${20 + 700 * eOutExpo(sw)}" fill="none" stroke="${C.orange}" stroke-width="${36 * (1 - sw) ** 2}" opacity="${1 - sw}"/>`;
      svg += `<circle cx="${SW / 2}" cy="${SH / 2}" r="${10 + 520 * eOutExpo(lin(u, 0.03, 0.6))}" fill="none" stroke="${C.paper}" stroke-width="${2 * (1 - sw)}" opacity="${0.8 * (1 - sw)}"/>`;
    }
    flash.style.background = C.orange;
    flash.style.opacity = 0.55 * decay(u, 14);
    // Spots → muscles.
    const ids = [['quads', 0], ['quads', 1], ['chest', 0], ['chest', 1], ['frontDelts', 0], ['frontDelts', 1], ['abs', 0], ['obliques', 0], ['obliques', 1], ['glutes', 0], ['glutes', 1], ['adductors', 0], ['adductors', 1], ['hamstrings', 0], ['biceps', 0], ['biceps', 1]];
    const pts = [];
    ids.forEach(([id, side], i) => {
      const m = muscleMesh(id, side);
      if (!m) return;
      const p = screenOf(m);
      const st = 0.02 + i * 0.018;
      const k = eOutExpo(lin(u, st, st + 0.42));
      // Curved flight: bow out sideways on the way.
      const bow = Math.sin(Math.PI * k) * (hash(i + 3) - 0.5) * 260;
      const dx = p.x - SW / 2;
      const dy = p.y - SH / 2;
      const n = Math.hypot(dx, dy) || 1;
      const x = SW / 2 + dx * k + (-dy / n) * bow;
      const y = SH / 2 + dy * k + (dx / n) * bow;
      pts.push([x, y, k]);
      const fade = 1 - lin(u, 0.55 + i * 0.01, 0.9);
      if (fade <= 0 || k <= 0) return;
      const r = (5.5 + 4 * kick(u - st - 0.42, 3, 6)) * fade;
      svg += `<circle cx="${x}" cy="${y}" r="${r * 2.8}" fill="${C.orange}" opacity="${0.18 * fade}"/>`;
      svg += `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.orange}"/>`;
    });
    // Constellation lines while they settle.
    const cl = Math.sin(Math.PI * lin(u, 0.2, 0.75));
    if (cl > 0) {
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 3) % pts.length];
        svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.paper}" stroke-width="0.7" opacity="${0.35 * cl}"/>`;
      }
    }
    // Iris reveal of the figure from the pelvis outwards.
    const pel = screenOf(figure.bones.spine);
    const rv = eOutExpo(lin(t, T.reveal, T.reveal + 0.55));
    const R = 1100 * rv;
    canvas.style.clipPath = `circle(${R}px at ${pel.x}px ${pel.y}px)`;
    if (rv > 0 && rv < 1) svg += `<circle cx="${pel.x}" cy="${pel.y}" r="${R}" fill="none" stroke="${C.orange}" stroke-width="${3 * (1 - rv)}" opacity="${1 - rv}"/>`;
    // FORM, huge and outlined, behind the body; fills orange on the peak.
    const fu = lin(t, T.reveal + 0.1, T.reveal + 0.6);
    if (fu > 0) {
      formWord.style.display = 'block';
      const fillA = 0.9 * eOutCubic(lin(t, T.squatPeak - 0.05, T.squatPeak + 0.2)) * (1 - 0.6 * lin(t, T.squatPeak + 0.2, T.montage));
      formWord.style.color = `rgba(255,79,31,${fillA})`;
      formWord.style.webkitTextStroke = `1.4px rgba(243,242,238,${0.32 * fu})`;
      formWord.style.opacity = 1;
      formWord.style.transform = `translateX(${lerp(-26, 26, lin(t, T.reveal, T.montage))}px) scale(${1.06 - 0.06 * eOutExpo(fu) + 0.03 * decay(t - T.squatPeak, 6) * (t >= T.squatPeak ? 1 : 0)})`;
    }
    halo.style.opacity = 1;
    halo.style.background = `radial-gradient(ellipse 40% 55% at ${pel.x}px ${pel.y + 20}px, rgba(255,79,31,${0.1 + 0.18 * decay(t - T.squatPeak, 4) * (t >= T.squatPeak ? 1 : 0)}) 0%, transparent 100%)`;
  }

  // ----- Act 3: montage -----
  if (shot && shot.montage !== undefined) {
    const { w, echo, m } = words[shot.montage];
    const col = WORD_ON[shot.bg];
    w.style.display = echo.style.display = 'block';
    const slam = eOutExpo(lin(lt, 0, 0.14));
    const drift = (m.layout === 'right' ? -1 : 1) * 14 * lt;
    w.style.color = col;
    w.style.webkitTextStroke = '0';
    w.style.opacity = lin(lt, 0, 0.03);
    w.style.filter = `blur(${6 * (1 - slam)}px)`;
    w.style.transform = `translateX(${drift}px) scale(${1.32 - 0.32 * slam + 0.03 * lt})`;
    const eu = lin(lt, 0.02, 0.4);
    echo.style.color = 'transparent';
    echo.style.webkitTextStroke = `1.5px ${col}`;
    echo.style.opacity = eu > 0 && eu < 1 ? 0.7 * (1 - eu) : 0;
    echo.style.filter = 'none';
    echo.style.transform = `translateX(${drift}px) scale(${1 + 0.35 * eOutExpo(eu)})`;
    // Spot ping on the working muscle at the top of the rep.
    const ex = byAnim[shot.anim];
    const mm = muscleMesh(ex.primary[0], 0);
    const pu = lin(lt, 0.2, 0.5);
    if (mm && pu > 0) {
      const p = screenOf(mm);
      const rr = 14 + 40 * (1 - eOutExpo(lin(lt, 0.2, 0.36)));
      const ringCol = shot.bg === 'orange' ? C.ink : C.orange;
      svg += `<circle cx="${p.x}" cy="${p.y}" r="${rr}" fill="none" stroke="${ringCol}" stroke-width="2" opacity="${1 - lin(lt, 0.4, 0.5)}"/>`;
      svg += `<circle cx="${p.x}" cy="${p.y}" r="${rr + 8}" fill="none" stroke="${ringCol}" stroke-width="1" stroke-dasharray="3 5" opacity="${0.7 * (1 - lin(lt, 0.4, 0.5))}" transform="rotate(${lt * 200} ${p.x} ${p.y})"/>`;
    }
  }
  if (shot && shot.stutter !== undefined) {
    // One-frame orange/white hit on every stutter cut.
    flash.style.background = shot.stutter % 2 ? C.orange : C.paper;
    flash.style.opacity = lt < 1 / FPS ? 0.5 : 0;
  }
  if (t >= T.gap && t < T.slowmo) {
    flash.style.background = C.paper;
    flash.style.opacity = 1;
  }

  // ----- Act 4: slow-mo, spotting -----
  if (shot && shot.slowmo) {
    flash.style.background = C.paper;
    flash.style.opacity = 0.85 * decay(lt, 7);
    const pel = screenOf(figure.bones.spine);
    halo.style.opacity = 1;
    halo.style.background = `radial-gradient(ellipse 34% 60% at ${pel.x}px ${pel.y}px, rgba(255,79,31,${0.12 + 0.2 * eInExpo(lin(lt, 2.6, 3.4))}) 0%, transparent 100%)`;
    const hudOut = lin(t, T.dolly[0] - 0.1, T.dolly[0] + 0.25);
    T.rings.forEach((rt, i) => {
      const u = t - rt;
      if (u < 0 || hudOut >= 1) return;
      const [id, name] = RING_IDS[i];
      const m = muscleMesh(id, 0);
      const p = screenOf(m);
      const a = (1 - hudOut) * lin(u, 0, 0.05);
      const snap = eOutBack(lin(u, 0, 0.3), 2.6);
      const r = 18 + 26 * (1 - snap);
      const lx = 790;
      const ly = 150 + i * 44;
      // Leader: from the ring, elbow, then out to the label on the right.
      const lu = eOutExpo(lin(u, 0.08, 0.4));
      const ex1 = p.x + (lx - 20 - p.x) * 0.35;
      const lineLen = lu;
      svg += `<g opacity="${a}">
        <circle cx="${p.x}" cy="${p.y}" r="${r}" fill="none" stroke="${C.orange}" stroke-width="2"/>
        <circle cx="${p.x}" cy="${p.y}" r="${r + 9}" fill="none" stroke="${C.orange}" stroke-width="1" stroke-dasharray="2 6" transform="rotate(${u * 90} ${p.x} ${p.y})"/>
        <circle cx="${p.x}" cy="${p.y}" r="3" fill="${C.orange}"/>
        <polyline points="${p.x + r},${p.y} ${lerp(p.x + r, ex1, lineLen)},${lerp(p.y, ly, lineLen)} ${lerp(p.x + r, lx - 12, lineLen)},${lerp(p.y, ly, lineLen)}" fill="none" stroke="${C.paper}" stroke-width="0.8" opacity="0.6"/>
      </g>`;
      if (lu > 0.6) {
        const la = a * lin(u, 0.25, 0.4);
        const chars = Math.floor(lin(u, 0.25, 0.55) * (name.length + 3));
        svg += `<text x="${lx}" y="${ly + 4}" font-family="Barlow Semi Condensed" font-weight="800" font-size="13" letter-spacing="2.4" fill="${C.orange}" opacity="${la}">0${i + 1}</text>`;
        svg += `<text x="${lx + 26}" y="${ly + 4}" font-family="Barlow Semi Condensed" font-weight="700" font-size="13" letter-spacing="2.4" fill="${C.paper}" opacity="${la}">${name.toUpperCase().slice(0, chars)}</text>`;
      }
    });
    // Cues type on, left column.
    T.cues.forEach((ct, i) => {
      const u = t - ct;
      if (u < 0) return;
      const c = cueEls[i];
      c.style.display = 'flex';
      const text = CUES[i];
      const n = Math.min(text.length, Math.floor(u * 34));
      c.querySelector('.txt').textContent = text.slice(0, n);
      const typing = n < text.length;
      const blink = typing || Math.floor(u * 4) % 2 === 0;
      c.querySelector('.caret').style.opacity = i === T.cues.filter((x) => t >= x).length - 1 && blink ? 1 : 0;
      c.style.top = `${190 + i * 50}px`;
      const inU = eOutExpo(lin(u, 0, 0.3));
      c.style.opacity = inU * (1 - hudOut);
      c.style.transform = `translate(${-16 * (1 - inU)}px, ${-24 * eInCubic(hudOut)}px)`;
    });
    // Blow out to orange as we fly into the quad.
    const bo = eInCubic(lin(t, T.dolly[1] - 0.32, T.dolly[1]));
    if (bo > 0) {
      flash.style.background = C.orange;
      flash.style.opacity = bo;
    }
  }

  // ----- Act 5: iris to a dot, the dot becomes the full stop -----
  if (t >= T.iris[0]) {
    logo.style.display = 'block';
    const D0 = 2 * Math.hypot(SW / 2, SH / 2) + 20;
    const iu = lin(t, T.iris[0], T.impact);
    const dLand = 26;
    let x = SW / 2;
    let y = SH / 2;
    let d = lerp(D0, dLand, eInCubic(iu) * 0.35 + eInExpo(iu) * 0.65);
    let sx = 1;
    let sy = 1;
    const after = t - T.impact;
    if (after >= 0) {
      // Land: squash, then glide right into the full stop with a stretch.
      const mv = eInOutExpo(lin(after, 0.12, 0.62));
      const vel = Math.sin(Math.PI * lin(after, 0.12, 0.62));
      x = lerp(SW / 2, L.stopX, mv);
      y = lerp(SH / 2, L.stopY, mv) - 120 * Math.sin(Math.PI * mv);
      d = lerp(dLand, L.stopD, eOutCubic(lin(after, 0.2, 0.7)));
      const squash = 0.5 * kick(after, 3.2, 6);
      sx = 1 + squash + 0.45 * vel;
      sy = 1 - squash * 0.8 - 0.2 * vel;
      // Heartbeat at the end.
      const hb = t - T.heartbeat;
      const beat = 0.3 * kick(hb, 2.6, 6) + 0.18 * kick(hb - 0.28, 2.6, 7);
      sx *= 1 + beat;
      sy *= 1 + beat;
    }
    dot.style.opacity = 1;
    dot.style.boxShadow = 'none';
    dot.style.transform = `translate(${x}px, ${y}px) scale(${(d / 100) * sx}, ${(d / 100) * sy})`;
    if (after >= 0) {
      // Impact ring and ink splash lines.
      const ru = lin(after, 0, 0.7);
      if (ru < 1) svg += `<circle cx="${SW / 2}" cy="${SH / 2}" r="${14 + 260 * eOutExpo(ru)}" fill="none" stroke="${C.orange}" stroke-width="${2.2 * (1 - ru)}" opacity="${1 - ru}"/>`;
      const su = lin(after, 0, 0.35);
      if (su < 1) {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 + 0.3;
          const r0 = 22 + 70 * eOutExpo(su);
          const r1 = r0 + 22 * (1 - su);
          svg += `<line x1="${SW / 2 + Math.cos(a) * r0}" y1="${SH / 2 + Math.sin(a) * r0}" x2="${SW / 2 + Math.cos(a) * r1}" y2="${SH / 2 + Math.sin(a) * r1}" stroke="${C.ink}" stroke-width="2.4" stroke-linecap="round" opacity="${1 - su}"/>`;
        }
      }
      const hb = t - T.heartbeat;
      const hu = lin(hb, 0, 0.9);
      if (hu > 0 && hu < 1) svg += `<circle cx="${L.stopX}" cy="${L.stopY}" r="${L.stopD / 2 + 80 * eOutExpo(hu)}" fill="none" stroke="${C.orange}" stroke-width="${1.6 * (1 - hu)}" opacity="${0.8 * (1 - hu)}"/>`;
    }
    // Letters rise out of their masks, left to right, as the dot passes.
    logo.querySelectorAll('.ch').forEach((c, i) => {
      const u = eOutExpo(lin(after, 0.1 + i * 0.06, 0.1 + i * 0.06 + 0.55));
      c.style.transform = `translateY(${(1 - u) * 110}%) rotate(${(1 - u) * 8}deg)`;
    });
    logo.querySelectorAll('.tw').forEach((c, i) => {
      const st = T.tagline - T.impact + i * 0.09;
      const u = eOutExpo(lin(after, st, st + 0.6));
      c.style.transform = `translateY(${(1 - u) * 115}%)`;
    });
    const push = 1 + 0.035 * eOutCubic(lin(t, T.impact, 15));
    logo.style.transform = `scale(${push})`;
    logo.style.transformOrigin = `${SW / 2}px ${SH / 2}px`;
    // The dot rides the same push.
    if (after >= 0) {
      const px = SW / 2 + (x - SW / 2) * push;
      const py = SH / 2 + (y - SH / 2) * push;
      dot.style.transform = `translate(${px}px, ${py}px) scale(${(d / 100) * sx * push}, ${(d / 100) * sy * push})`;
    }
  }

  fx.innerHTML = svg;

  // ----- HUD -----
  const hudOn = t >= 0.35 && t < T.dolly[0] + 0.15;
  hud.style.display = hudOn ? 'block' : 'none';
  if (hudOn) {
    const a = eOutCubic(lin(t, 0.35, 0.9)) * (1 - lin(t, T.dolly[0] - 0.15, T.dolly[0] + 0.15));
    hud.style.opacity = a;
    hud.style.color = ink;
    let tl = 'N° 00&nbsp;&nbsp;<b>STANDBY</b>';
    let bl = 'FORM COACH';
    let br = `00 / ${TOTAL}`;
    if (shot) {
      const ex = byAnim[shot.anim];
      tl = `N° ${String(ex.index).padStart(2, '0')}&nbsp;&nbsp;<b>${ex.name.toUpperCase()}</b>`;
      bl = shot.slowmo ? '¼ SPEED&nbsp;&nbsp;·&nbsp;&nbsp;SPOTTING' : ex.primary.map((m) => m.replace(/([A-Z])/g, ' $1')).join(' · ').toUpperCase();
      br = `${String(ex.index).padStart(2, '0')} / ${TOTAL}`;
    }
    if (t >= T.gap && t < T.slowmo) hud.style.color = C.ink;
    hudTL.innerHTML = tl;
    hudTR.textContent = tc(t);
    hudBL.innerHTML = bl;
    hudBR.textContent = br;
  }

  // ----- Grain -----
  const f = Math.round(t * FPS);
  gctx.drawImage(plates[f % plates.length], 0, 0);
  grain.style.opacity = bgName === 'ink' || t < T.burst ? 0.13 : 0.08;
}

// ---------- Boot ----------

async function boot() {
  await Promise.all(['600', '700', '800', '900'].map((w) => document.fonts.load(`${w} 100px "Barlow Semi Condensed"`)));
  await document.fonts.ready;
  bakeGrain();
  layoutWords();
  layoutLogo();
  // Warm every animation + prop set once so the first frame of each shot is clean.
  for (const s of SHOTS) {
    useAnim(s.anim);
    figure.applyPose(anim.pose(0.5));
  }
  figure.applyPose(standingPose());
  window.seek = (t) => {
    seek(t);
    return true;
  };
  window.__ready = true;
  const q = new URLSearchParams(location.search);
  if (q.has('t')) seek(parseFloat(q.get('t')));
  else if (q.has('play')) {
    const start = performance.now();
    const loop = () => {
      seek(((performance.now() - start) / 1000) % 15);
      requestAnimationFrame(loop);
    };
    loop();
  } else seek(0);
}
boot();
