// Screen wake lock, audio unlock, haptic taps. All optional; failures are ignored.

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

// iOS: by default a page's Web Audio can stop your music app (e.g. Spotify). "transient" makes cues
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

// Shared AudioContext (null until the first tap has created it).
export const audioContext = () => (ctx && ctx.state !== 'closed' ? ctx : null);

// Resolves once audio can play (the first tap starts it; resuming is async).
export async function audioReady() {
  const c = audioContext();
  if (!c) return null;
  if (c.state !== 'running') {
    try {
      await c.resume();
    } catch {
      return null;
    }
  }
  return c.state === 'running' ? c : null;
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
