import { icon } from './icons.js';

const root = () => document.getElementById('sheet');

export function openSheet(html, { tall = false } = {}) {
  const r = root();
  r.innerHTML = `<div class="sheet-scrim" data-action="close-sheet"></div>
    <div class="sheet-panel ${tall ? 'is-tall' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  r.hidden = false;
  requestAnimationFrame(() => r.classList.add('is-open'));
}

export function closeSheet() {
  const r = root();
  r.classList.remove('is-open');
  r.hidden = true;
  r.innerHTML = '';
}

export const sheetOpen = () => !root().hidden;

export const sheetHead = (title, closeAction = 'close-sheet') =>
  `<div class="sheet-head"><h2>${title}</h2><button class="icon-btn" data-action="${closeAction}" aria-label="Close">${icon.close}</button></div>`;

export function confirmSheet(title, body, actionLabel, action, { danger = false, data = '' } = {}) {
  openSheet(`
    <div class="sheet-head"><h2>${title}</h2></div>
    <p class="sheet-text">${body}</p>
    <div class="sheet-actions">
      <button class="btn btn-ghost" data-action="close-sheet">Cancel</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="${action}" ${data}>${actionLabel}</button>
    </div>`);
}
