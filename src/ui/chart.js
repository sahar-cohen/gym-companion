// Single-series progress chart (top-set weight per session) as inline SVG.
// Tap or hover a point for its details; the session list under it is the table view.
import { esc, fmtDate, fmtKg } from '../app/util.js';

const W = 340;
const H = 190;
const PAD = { l: 34, r: 44, t: 16, b: 26 };

function niceStep(range) {
  const raw = range / 3;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
}

export function progressChart(points, { unit = 'kg', value = (p) => p.w, tipText = (p) => `${fmtKg(p.w)} kg × ${p.r}` } = {}) {
  if (!points.length) return '';
  const vals = points.map(value);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi === lo) {
    lo -= 5;
    hi += 5;
  }
  const step = niceStep(hi - lo);
  lo = Math.max(0, Math.floor(lo / step) * step);
  hi = Math.ceil(hi / step) * step;

  const t0 = points[0].at;
  const t1 = points[points.length - 1].at;
  const x = (t) => (t1 === t0 ? (PAD.l + W - PAD.r) / 2 : PAD.l + ((t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r));
  const y = (v) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);

  const grid = [];
  for (let v = lo; v <= hi + 1e-9; v += step) {
    grid.push(`<line class="ch-grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v)}" y2="${y(v)}"/>
      <text class="ch-axis" x="${PAD.l - 6}" y="${y(v) + 4}" text-anchor="end">${fmtKg(v)}</text>`);
  }
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.at).toFixed(1)},${y(value(p)).toFixed(1)}`).join('');
  const last = points[points.length - 1];

  const dots = points
    .map((p, i) => {
      const cx = x(p.at);
      const cy = y(value(p));
      const tip = `${fmtDate(p.at)} · ${tipText(p)}`;
      return `<g class="ch-pt" data-tip="${esc(tip)}" data-x="${(cx / W) * 100}" data-y="${(cy / H) * 100}" tabindex="0" role="img" aria-label="${esc(tip)}">
        <rect class="ch-hit" x="${cx - 16}" y="${PAD.t}" width="32" height="${H - PAD.t - PAD.b}"/>
        <circle class="ch-dot ${i === points.length - 1 ? 'is-last' : ''}" cx="${cx}" cy="${cy}" r="4"/>
      </g>`;
    })
    .join('');

  return `<figure class="chart" data-chart>
    <svg viewBox="0 0 ${W} ${H}" role="group" aria-label="Top set weight per session">
      ${grid.join('')}
      <path class="ch-line" d="${path}"/>
      ${dots}
      <text class="ch-label" x="${x(last.at) + 8}" y="${y(value(last)) + 4}">${fmtKg(value(last))} ${unit}</text>
      <text class="ch-axis" x="${PAD.l}" y="${H - 6}">${fmtDate(t0)}</text>
      ${points.length > 1 ? `<text class="ch-axis" x="${W - PAD.r}" y="${H - 6}" text-anchor="end">${fmtDate(t1)}</text>` : ''}
    </svg>
    <div class="ch-tip" hidden></div>
  </figure>`;
}

// Tooltip behaviour, delegated once for every chart on the page.
function showTip(g) {
  const fig = g.closest('[data-chart]');
  const tip = fig.querySelector('.ch-tip');
  fig.querySelectorAll('.ch-pt.is-on').forEach((el) => el.classList.remove('is-on'));
  g.classList.add('is-on');
  tip.textContent = g.dataset.tip;
  tip.hidden = false;
  const left = Math.min(78, Math.max(22, +g.dataset.x));
  tip.style.left = `${left}%`;
  tip.style.top = `${+g.dataset.y}%`;
}
for (const type of ['pointerover', 'click', 'focusin']) {
  document.addEventListener(type, (e) => {
    const g = e.target.closest?.('.ch-pt');
    if (g) showTip(g);
  });
}
document.addEventListener('pointerout', (e) => {
  if (e.pointerType !== 'mouse') return;
  const g = e.target.closest?.('.ch-pt');
  if (!g) return;
  g.classList.remove('is-on');
  g.closest('[data-chart]').querySelector('.ch-tip').hidden = true;
});
