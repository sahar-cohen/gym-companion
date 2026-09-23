import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Figure } from './figure.js';
import { ANIMATIONS, sample, standingPose } from './animations.js';
import { buildProps, setPropColors } from './props.js';

const DEG = Math.PI / 180;
const BASE_FOV = 32;

const THEMES = {
  light: {
    body: '#c3c7cd', joint: '#aab0b8', primary: '#ff4f1f', secondary: '#ffab8c',
    floor: '#e4e2dc', shadow: 'rgba(20,22,26,0.18)',
    frame: '#7b818a', pad: '#34383e', metal: '#2a2d32', cable: '#1b1d21',
    hemiSky: 0xffffff, hemiGround: 0xb9b4aa,
  },
  dark: {
    body: '#8b919a', joint: '#6f757e', primary: '#ff6433', secondary: '#c97d62',
    floor: '#1d1f23', shadow: 'rgba(0,0,0,0.5)',
    frame: '#4a4f57', pad: '#2a2d33', metal: '#8d939c', cable: '#a8adb5',
    hemiSky: 0xdfe6ff, hemiGround: 0x202226,
  },
};

function floorFade() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 30, 128, 128, 128);
  grad.addColorStop(0, '#fff');
  grad.addColorStop(0.55, '#bbb');
  grad.addColorStop(1, '#000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export class Viewer {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.el = this.renderer.domElement;
    this.el.className = 'viewer-canvas';

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 50);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0xb9b4aa, 1.6);
    this.scene.add(this.hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(2, 4, 3);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.7);
    rim.position.set(-3, 2, -3);
    this.scene.add(rim);

    // Floor fades out at the edge so it blends into the page background.
    this.floorMat = new THREE.MeshStandardMaterial({ color: 0xe4e2dc, roughness: 1, transparent: true, alphaMap: floorFade(), depthWrite: false });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(2.2, 64), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    this.shadowMat = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.2, color: 0x000000 });
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), this.shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.002;
    this.scene.add(this.shadow);

    this.figure = new Figure();
    this.scene.add(this.figure.root);

    this.controls = new OrbitControls(this.camera, this.el);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.4;
    this.controls.maxDistance = 7;
    this.controls.maxPolarAngle = 100 * DEG;
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };

    this.clock = new THREE.Clock();
    this.t = 0;
    this.running = false;
    this.anim = null;
    this.props = null;
    this.defaultCam = { az: 30, el: 10, dist: 3.4, y: 0.9 };

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.setTheme('light');
  }

  mount(container) {
    if (this.el.parentElement !== container) container.appendChild(this.el);
    this.resizeObserver.disconnect();
    this.resizeObserver.observe(container);
    this.resize();
  }

  resize() {
    const box = this.el.parentElement;
    if (!box) return;
    const w = box.clientWidth;
    const h = box.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.el.style.width = '100%';
    this.el.style.height = '100%';
    this.camera.aspect = w / h;
    // Tall stages: widen the view so side-on setups (benches, bars) aren't cropped.
    const minAspect = 0.9;
    const t = Math.tan((BASE_FOV / 2) * DEG) * Math.max(1, minAspect / this.camera.aspect);
    this.camera.fov = (2 * Math.atan(t)) / DEG;
    this.camera.updateProjectionMatrix();
  }

  setTheme(mode) {
    const c = THEMES[mode] ?? THEMES.light;
    this.figure.setColors(c);
    setPropColors(c);
    this.floorMat.color.set(c.floor);
    this.shadowMat.opacity = mode === 'dark' ? 0.55 : 0.22;
    this.hemi.color.set(c.hemiSky);
    this.hemi.groundColor.set(c.hemiGround);
  }

  // exercise: { animation, camera, primary, secondary }
  show({ animation, camera, primary, secondary }) {
    const anim = ANIMATIONS[animation] ?? ANIMATIONS.none;
    this.controls.autoRotate = false;
    this.bodyMap = false;
    this.anim = anim ?? null;
    this.figure.setMuscles(primary, secondary);
    this.t = 0;
    if (this.props) {
      this.props.dispose();
      this.scene.remove(this.props.group);
      this.props = null;
    }
    if (anim) {
      this.figure.applyPose(anim.pose(0));
      this.props = buildProps(anim.props, this.figure);
      this.scene.add(this.props.group);
      this.props.update();
    }
    this.defaultCam = { ...this.defaultCam, ...anim?.camera, ...camera };
    this.resetView();
    this.renderOnce();
  }

  // Static figure with muscles tinted by level; slowly turns.
  showBodyMap(levels) {
    this.anim = null;
    this.bodyMap = true;
    if (this.props) {
      this.props.dispose();
      this.scene.remove(this.props.group);
      this.props = null;
    }
    this.figure.applyPose(standingPose());
    this.figure.setMuscleLevels(levels);
    this.shadow.position.set(0, 0.002, 0);
    this.defaultCam = { az: 0, el: 6, dist: 4.1, y: 0.95 };
    this.resetView();
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 1.6;
    this.renderOnce();
  }

  resetView() {
    const { az, el, dist, y } = this.defaultCam;
    const target = new THREE.Vector3(0, y, 0);
    this.controls.target.copy(target);
    this.camera.position.set(
      target.x + dist * Math.sin(az * DEG) * Math.cos(el * DEG),
      target.y + dist * Math.sin(el * DEG),
      target.z + dist * Math.cos(az * DEG) * Math.cos(el * DEG),
    );
    this.controls.update();
  }

  frame(dt) {
    if (this.anim) {
      this.t += dt;
      const { s, glow } = sample(this.anim, this.t);
      this.figure.applyPose(this.anim.pose(s));
      this.figure.setGlow(glow);
      this.props?.update();
      const p = this.figure.bones.pelvis.position;
      this.shadow.position.x = p.x;
      this.shadow.position.z = p.z;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  renderOnce() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.getDelta();
    const loop = () => {
      if (!this.running) return;
      this.frame(Math.min(this.clock.getDelta(), 0.1));
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
