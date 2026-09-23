export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, '0')}`;
}

export function fmtDuration(ms) {
  const min = Math.max(1, Math.round(ms / 60000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

// 40 → "40", 37.5 → "37.5"
export const fmtKg = (w) => (Math.round(w * 10) / 10).toString();

export function fmtDate(t, withYear = false) {
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
}

export function daysAgo(t) {
  const d = Math.floor((Date.now() - t) / 86400000);
  return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

// Target reps from strings like "12", "8–10" → upper bound.
export function targetReps(reps) {
  const nums = String(reps).match(/\d+/g);
  return nums ? Math.max(...nums.map(Number)) : 10;
}

export const uid = (prefix = 'x') => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

export const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || 'item';

export const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
