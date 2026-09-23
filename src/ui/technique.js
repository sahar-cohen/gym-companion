// Technique notes and the 3D stage, shared by the workout and library screens.
import { state } from '../app/state.js';
import { esc } from '../app/util.js';
import { getViewer } from '../app/viewer.js';
import { muscleName } from '../data/muscles.js';
import { icon } from './icons.js';
import { openSheet, sheetHead } from './sheets.js';

// Form cues and common mistakes, always visible under the stage.
export function techniqueNotes(ex) {
  return `
    ${ex.confirm ? `<p class="confirm-note">${icon.flag}<span><b>Confirm with coach.</b> ${esc(ex.confirm)}</span></p>` : ''}
    ${ex.cues?.length ? `<h3 class="sheet-sub">Form</h3><ol class="cues">${ex.cues.map((c) => `<li>${esc(c)}</li>`).join('')}</ol>` : ''}
    ${ex.avoid?.length ? `<h3 class="sheet-sub">Avoid</h3><ul class="avoid">${ex.avoid.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}`;
}

// The 3D figure in its rounded stage: variant switch on top, muscles pill below.
export function stageHtml(ex, musclesAction = 'muscles') {
  const variants = ex.variants?.length
    ? `<div class="seg-ctl" role="group" aria-label="Variant">${ex.variants
        .map((v) => `<button data-action="variant" data-ex="${ex.id}" data-v="${v.id}" class="${v.id === ex.variantId ? 'is-on' : ''}">${esc(v.label)}</button>`)
        .join('')}</div>`
    : '';
  const muscles = ex.primary?.length
    ? `<button class="info-pill" data-action="${musclesAction}">
        <span class="legend-key key-primary"></span>
        <span class="info-pill-text">${esc(ex.primary.map(muscleName).join(', '))}</span>
        <span class="info-pill-more">Muscles</span>
      </button>`
    : '<span></span>';
  return `<div class="stage">
    <div class="stage-canvas" id="stage-canvas"></div>
    <div class="stage-top"><span></span>${variants}</div>
    ${state.hintSeen ? '' : `<div class="stage-hint" id="stage-hint">${icon.rotate}<span>Drag to rotate</span></div>`}
    <div class="stage-bottom">
      ${muscles}
      <button class="icon-btn stage-reset" data-action="reset-view" aria-label="Reset view">${icon.reset}</button>
    </div>
  </div>`;
}

// Primary / secondary muscles, from the pill on the stage.
export function musclesSheet(ex) {
  const chips = (ids, cls) => ids.map((m) => `<span class="mchip ${cls}">${esc(muscleName(m))}</span>`).join('');
  openSheet(`
    ${sheetHead(esc(ex.name))}
    <div class="legend">
      <div class="legend-row"><span class="legend-key key-primary"></span><span class="legend-label">Primary</span>${chips(ex.primary, 'is-primary')}</div>
      ${ex.secondary?.length ? `<div class="legend-row"><span class="legend-key key-secondary"></span><span class="legend-label">Secondary</span>${chips(ex.secondary, 'is-secondary')}</div>` : ''}
    </div>`);
}

// Mount the shared viewer in the stage and show `ex` (re-starts only when it changed).
let shownKey = null;
export function mountStage(ex) {
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
