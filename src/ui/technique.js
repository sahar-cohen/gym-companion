// Technique notes and the 3D stage, shared by the workout and library screens.
import { state } from '../app/state.js';
import { esc } from '../app/util.js';
import { getViewer } from '../app/viewer.js';
import { muscleName } from '../data/muscles.js';
import { icon } from './icons.js';

export function techniqueNotes(ex) {
  const primary = ex.primary.map(muscleName);
  const secondary = (ex.secondary ?? []).map(muscleName);
  return `
    ${ex.confirm ? `<p class="note-flag">${icon.flag}<span>${esc(ex.confirm)} Confirm with your coach.</span></p>` : ''}
    ${
      ex.cues?.length
        ? `<section class="notes-block"><h3 class="label">Form</h3>
            <ol class="cues">${ex.cues.map((c) => `<li>${esc(c)}</li>`).join('')}</ol></section>`
        : ''
    }
    ${
      ex.avoid?.length
        ? `<section class="notes-block"><h3 class="label">Avoid</h3>
            <ul class="avoid">${ex.avoid.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></section>`
        : ''
    }
    ${
      primary.length || secondary.length
        ? `<section class="notes-block"><h3 class="label">Works</h3>
            <p class="works">${primary.length ? `<span class="works-primary">${primary.map(esc).join(', ')}</span>` : ''}${
              secondary.length ? `<span class="works-secondary">${secondary.map(esc).join(', ')}</span>` : ''
            }</p></section>`
        : ''
    }`;
}

// The 3D figure fills this slot; variant switch (e.g. Hanging / Captain's chair) on top.
export function stageHtml(ex) {
  const variants = ex.variants?.length
    ? `<div class="variants" role="group" aria-label="Variant">${ex.variants
        .map((v) => `<button data-action="variant" data-ex="${ex.id}" data-v="${v.id}" class="${v.id === ex.variantId ? 'is-on' : ''}" aria-pressed="${v.id === ex.variantId}">${esc(v.label)}</button>`)
        .join('')}</div>`
    : '';
  return `<div class="stage">
    <div class="stage-canvas" id="stage-canvas"></div>
    ${variants}
    ${state.hintSeen ? '' : `<div class="stage-hint" id="stage-hint">${icon.rotate}<span>Drag to turn</span></div>`}
    <button class="stage-reset" data-action="reset-view" aria-label="Reset view">${icon.reset}</button>
  </div>`;
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
