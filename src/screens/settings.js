import { state, saveSettings } from '../app/state.js';
import { load, save } from '../lib/storage.js';
import { voiceSupported } from '../lib/voice.js';
import { openSheet, sheetHead } from '../ui/sheets.js';
import { showToast } from './workout.js';

let applyThemeFn = () => {};
export const setApplyTheme = (fn) => (applyThemeFn = fn);

export function settingsSheet() {
  const st = state.settings;
  const toggle = (key, label, hint = '') =>
    `<label class="srow"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span>
      <input type="checkbox" class="switch" data-setting="${key}" ${st[key] ? 'checked' : ''}></label>`;
  openSheet(
    `${sheetHead('Settings')}
    ${voiceSupported ? toggle('voice', 'Voice coach', 'Announces each exercise') : ''}
    <div class="srow">
      <span>Theme</span>
      <div class="seg-ctl">${['system', 'light', 'dark']
        .map((t) => `<button data-action="theme" data-t="${t}" class="${st.theme === t ? 'is-on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`)
        .join('')}</div>
    </div>

    <h3 class="sheet-sub">Your data</h3>
    <div class="srow">
      <span>Backup<small>Workouts and settings as a file</small></span>
      <span class="btn-pair">
        <button class="btn btn-ghost btn-sm" data-action="export-data">Export</button>
        <label class="btn btn-ghost btn-sm">Import<input type="file" accept="application/json,.json" data-import hidden></label>
      </span>
    </div>`,
    { tall: true },
  );
}

const BACKUP_KEYS = ['workouts', 'settings', 'variants', 'lastDone', 'picks'];

function exportData() {
  const data = { app: 'gym-companion', version: 2, exportedAt: new Date().toISOString(), data: {} };
  for (const k of BACKUP_KEYS) data.data[k] = load(k, null);
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gym-companion-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function importData(file) {
  try {
    const json = JSON.parse(await file.text());
    if (json.app !== 'gym-companion' || !json.data) throw new Error('bad file');
    for (const k of BACKUP_KEYS) if (json.data[k] != null) save(k, json.data[k]);
    showToast('Backup restored. Reloading…');
    setTimeout(() => location.reload(), 900);
  } catch {
    showToast('That file isn’t a Gym Companion backup');
  }
}

export const settingsActions = {
  settings: settingsSheet,
  theme: (el) => {
    state.settings.theme = el.dataset.t;
    saveSettings();
    applyThemeFn();
    settingsSheet();
  },
  'export-data': exportData,
};
