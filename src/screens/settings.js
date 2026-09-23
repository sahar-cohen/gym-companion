import { state, saveSettings } from '../app/state.js';
import { esc } from '../app/util.js';
import { load, save } from '../lib/storage.js';
import { canVibrate } from '../lib/device.js';
import { voiceSupported } from '../lib/voice.js';
import * as sp from '../lib/spotify.js';
import { openSheet, sheetHead } from '../ui/sheets.js';
import { showToast } from './workout.js';

let applyThemeFn = () => {};
export const setApplyTheme = (fn) => (applyThemeFn = fn);

const clientId = () => sp.envClientId || state.settings.spotifyClientId;

function spotifySection() {
  const S = state.spotify;
  if (S.connected) {
    return `<div class="srow">
      <span>Spotify<small>Connected${S.user ? ` as ${esc(S.user)}` : ''}${S.premium === false ? ' · Free (now playing only)' : ''}</small></span>
      <button class="btn btn-ghost btn-sm" data-action="sp-logout">Disconnect</button>
    </div>`;
  }
  const needsId = !sp.envClientId;
  return `<div class="spotify-box">
    <div class="srow no-line"><span>Spotify<small>Control music without leaving the app</small></span>
      <button class="btn btn-primary btn-sm" data-action="sp-login">Connect</button></div>
    ${
      needsId
        ? `<label class="field"><span class="field-label">Client ID <small>one-time setup, see README</small></span>
            <input class="field-input" data-setting-text="spotifyClientId" value="${esc(state.settings.spotifyClientId)}" placeholder="32-character Client ID" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
           <p class="field-help">Redirect URI to register: <code>${esc(sp.redirectUri())}</code>${
             location.hostname === 'localhost' ? '<br>Spotify rejects “localhost”; open the app at 127.0.0.1 instead.' : ''
           }</p>`
        : ''
    }
  </div>`;
}

export function settingsSheet() {
  const st = state.settings;
  const toggle = (key, label, hint = '') =>
    `<label class="srow"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span>
      <input type="checkbox" class="switch" data-setting="${key}" ${st[key] ? 'checked' : ''}></label>`;
  const overrides = Object.keys(state.restOverrides).length;
  openSheet(
    `${sheetHead('Settings')}
    <div class="srow">
      <span>Default rest</span>
      <span class="stepper">
        <button class="round-btn sm" data-action="rest-default" data-d="-15" aria-label="Less">−</button>
        <b id="rest-default">${st.rest}s</b>
        <button class="round-btn sm" data-action="rest-default" data-d="15" aria-label="More">+</button>
      </span>
    </div>
    ${voiceSupported ? toggle('voice', 'Voice coach', 'Announces exercises and counts down rest') : ''}
    ${toggle('sound', 'Sound when rest ends', 'Plays over your music. Muted by the silent switch on iPhone.')}
    ${canVibrate ? toggle('vibrate', 'Vibrate when rest ends') : ''}
    <div class="srow">
      <span>Theme</span>
      <div class="seg-ctl">${['system', 'light', 'dark']
        .map((t) => `<button data-action="theme" data-t="${t}" class="${st.theme === t ? 'is-on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`)
        .join('')}</div>
    </div>
    <div class="srow">
      <span>Per-exercise rest times<small>${overrides ? `${overrides} saved` : 'None saved'}</small></span>
      <button class="btn btn-ghost btn-sm" data-action="clear-overrides" ${overrides ? '' : 'disabled'}>Reset</button>
    </div>

    <h3 class="sheet-sub">Music</h3>
    ${spotifySection()}

    <h3 class="sheet-sub">Your data</h3>
    <div class="srow">
      <span>Backup<small>Workouts, history and settings as a file</small></span>
      <span class="btn-pair">
        <button class="btn btn-ghost btn-sm" data-action="export-data">Export</button>
        <label class="btn btn-ghost btn-sm">Import<input type="file" accept="application/json,.json" data-import hidden></label>
      </span>
    </div>`,
    { tall: true },
  );
}

const BACKUP_KEYS = ['workouts', 'history', 'settings', 'restOverrides', 'variants', 'selected'];

function exportData() {
  const data = { app: 'gym-companion', exportedAt: new Date().toISOString(), data: {} };
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
  'rest-default': (el) => {
    state.settings.rest = Math.min(600, Math.max(15, state.settings.rest + +el.dataset.d));
    saveSettings();
    document.getElementById('rest-default').textContent = `${state.settings.rest}s`;
  },
  theme: (el) => {
    state.settings.theme = el.dataset.t;
    saveSettings();
    applyThemeFn();
    settingsSheet();
  },
  'clear-overrides': () => {
    state.restOverrides = {};
    save('restOverrides', {});
    settingsSheet();
  },
  'sp-login': () => {
    const id = clientId().trim();
    if (!/^[0-9a-f]{32}$/i.test(id)) return showToast('Paste your Spotify Client ID first');
    sp.login(id);
  },
  'sp-logout': () => {
    sp.logout();
    Object.assign(state.spotify, { connected: false, user: null, playback: null, premium: undefined });
    settingsSheet();
  },
  'export-data': exportData,
};

// Plain text settings (e.g. Spotify Client ID).
export function onSettingText(el) {
  state.settings[el.dataset.settingText] = el.value.trim();
  saveSettings();
}

