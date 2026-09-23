// Technique notes and the 3D stage, shared by the workout and library screens.
import { state } from '../app/state.js';
import { esc } from '../app/util.js';
import { getViewer } from '../app/viewer.js';
import { muscleName } from '../data/muscles.js';
import { icon } from './icons.js';
import { openSheet, sheetHead } from './sheets.js';

// Form cues, common mistakes and muscles, in one sheet (from the pill on the stage).
export function infoSheet(ex) {
  const chips = (ids, cls) => ids.map((m) => `<span class="mchip ${cls}">${esc(muscleName(m))}</span>`).join('');
  openSheet(`
    ${sheetHead(esc(ex.name))}
    ${ex.confirm ? `<p class="confirm-note">${icon.flag}<span><b>Confirm with coach.</b> ${esc(ex.confirm)}</span></p>` : ''}
    ${ex.cues?.length ? `<h3 class="sheet-sub">Form</h3><ol class="cues">${ex.cues.map((c) => `<li>${esc(c)}</li>`).join('')}</ol>` : ''}
    ${ex.avoid?.length ? `<h3 class="sheet-sub">Avoid</h3><ul class="avoid">${ex.avoid.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
    ${
      ex.primary?.length
        ? `<h3 class="sheet-sub">Muscles</h3>
          <div class="legend">
            <div class="legend-row"><span class="legend-key key-primary"></span><span class="legend-label">Primary</span>${chips(ex.primary, 'is-primary')}</div>
            ${ex.secondary?.length ? `<div class="legend-row"><span class="legend-key key-secondary"></span><span class="legend-label">Secondary</span>${chips(ex.secondary, 'is-secondary')}</div>` : ''}
          </div>`
        : ''
    }`);
}

// The 3D figure in its rounded stage: variant switch on top, muscles + Form tips pill below.
export function stageHtml(ex) {
  const variants = ex.variants?.length
    ? `<div class="seg-ctl" role="group" aria-label="Variant">${ex.variants
        .map((v) => `<button data-action="variant" data-ex="${ex.id}" data-v="${v.id}" class="${v.id === ex.variantId ? 'is-on' : ''}">${esc(v.label)}</button>`)
        .join('')}</div>`
    : '';
  return `<div class="stage">
    <div class="stage-canvas" id="stage-canvas"></div>
    <div class="stage-top">${ex.confirm ? `<button class="flag" data-action="info">${icon.flag}<span>Confirm with coach</span></button>` : '<span></span>'}${variants}</div>
    ${state.hintSeen ? '' : `<div class="stage-hint" id="stage-hint">${icon.rotate}<span>Drag to rotate</span></div>`}
    <div class="stage-bottom">
      <button class="info-pill" data-action="info">
        <span class="legend-key key-primary"></span>
        <span class="info-pill-text">${esc((ex.primary ?? []).map(muscleName).join(', ') || ex.name)}</span>
        <span class="info-pill-more">Form tips</span>
      </button>
      <button class="icon-btn stage-reset" data-action="reset-view" aria-label="Reset view">${icon.reset}</button>
  </div>`;
}

// Mount the shared viewer in the stage and show `ex` (re-starts only when it changed).
let shownKey = null;
let shownEx = null;
export function mountStage(ex) {
  shownEx = ex;
  const viewer = getViewer();
  viewer.mount(document.getElementById('stage-canvas'));
  const key = `${ex.id}:${ex.variantId ?? ''}:${ex.animation}:${(ex.primary ?? []).join()}`;
  if (key !== shownKey) {
    viewer.show(ex);
    shownKey = key;
  }
  viewer.start();
}
export const forgetStage = () => (shownKey = null);

// Stage buttons act on whatever exercise the stage is showing.
export const stageActions = {
  info: () => shownEx && infoSheet(shownEx),
};
