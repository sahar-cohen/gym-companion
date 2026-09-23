// Screen wake lock, rest-end sound, vibration. All optional; failures are ignored.

let lock = null;
let wantLock = false;

async function acquire() {
  if (!wantLock || lock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => {
      lock = null;
    });
  } catch {
    lock = null; // Rejected (battery saver, unsupported, not visible). Tolerate.
  }
}

export function keepAwake(on) {
  wantLock = on;
  if (on) acquire();
  else if (lock) {
    lock.release().catch(() => {});
    lock = null;
  }
}

document.addEventListener('visibilitychange', acquire);

// iOS: by default a page's Web Audio can stop Spotify. "transient" makes cues
// mix over other audio (briefly ducking it) and respect the silent switch.
try {
  if (navigator.audioSession) navigator.audioSession.type = 'transient';
} catch {
  /* ignore */
}

// Audio needs a user gesture before it can play; unlock on the first tap.
let ctx = null;
function unlock() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null;
  }
}
window.addEventListener('pointerdown', unlock, { passive: true });

export function chime() {
  if (!ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime;
  [0, 0.18, 0.36].forEach((dt, k) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = k === 2 ? 1320 : 880;
    gain.gain.setValueAtTime(0.0001, t0 + dt);
    gain.gain.exponentialRampToValueAtTime(0.5, t0 + dt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + (k === 2 ? 0.45 : 0.14));
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0 + dt);
    osc.stop(t0 + dt + 0.5);
  });
}

export function tick() {
  if (!ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 660;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + 0.1);
}

export const canVibrate = typeof navigator.vibrate === 'function';

// iOS has no Vibration API. Toggling a hidden <input switch> through its label
// gives a system haptic tick (iOS 17.4+, only inside a user gesture).
let hapticLabel = null;
export function haptic() {
  if (canVibrate) {
    try {
      navigator.vibrate(12);
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    if (!hapticLabel) {
      const id = 'haptic-switch';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = id;
      input.setAttribute('switch', '');
      hapticLabel = document.createElement('label');
      hapticLabel.htmlFor = id;
      for (const el of [input, hapticLabel]) {
        el.setAttribute('aria-hidden', 'true');
        el.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none';
      }
      document.body.append(input, hapticLabel);
    }
    hapticLabel.click();
  } catch {
    /* ignore */
  }
}

export function buzz(pattern = [220, 100, 220, 100, 400]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}
