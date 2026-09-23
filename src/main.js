import '@fontsource/barlow-semi-condensed/500.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/barlow-semi-condensed/700.css';
import './styles.css';
import { registerSW } from 'virtual:pwa-register';

import { state, setRender, render, validSession, saveSettings } from './app/state.js';
import { existingViewer } from './app/viewer.js';
import { keepAwake } from './lib/device.js';
import { handleRedirect } from './lib/spotify.js';
import { closeSheet, resetScroll, setBaseTheme } from './ui/sheets.js';
import { playerActions, initSpotify } from './ui/player.js';
import { renderHome, homeActions } from './screens/home.js';
import { renderWorkout, leaveWorkout, workoutActions, onLogInput, clockTick, showToast } from './screens/workout.js';
import { renderSummary, summaryActions } from './screens/summary.js';
import { renderEditor, editorActions, onEditorInput } from './screens/editor.js';
import { settingsActions, settingsSheet, setApplyTheme, onSettingText, importData } from './screens/settings.js';

registerSW({ immediate: true });

const app = document.getElementById('app');

// ---------- Theme ----------

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = state.settings.theme === 'system' ? (darkQuery.matches ? 'dark' : 'light') : state.settings.theme;
  document.documentElement.dataset.theme = t;
  setBaseTheme(t === 'dark' ? '#0f1012' : '#f3f2ee');
  existingViewer()?.setTheme(t);
  existingViewer()?.renderOnce();
}
darkQuery.addEventListener?.('change', applyTheme);
setApplyTheme(applyTheme);

// ---------- Router ----------

let lastScreen = null;
setRender(() => {
  existingViewer()?.stop();
  if (lastScreen === 'workout' && state.screen !== 'workout') leaveWorkout();
  if (state.screen === 'workout' && !state.session) state.screen = 'home';
  if (state.screen === 'done' && !state.summary) state.screen = 'home';
  if (state.screen === 'editor' && !state.editor) state.screen = 'home';
  lastScreen = state.screen;
  document.body.dataset.screen = state.screen;

  if (state.screen === 'workout') renderWorkout(app);
  else if (state.screen === 'done') renderSummary(app);
  else if (state.screen === 'editor') renderEditor(app);
  else renderHome(app);
});

// ---------- Events ----------

const actions = {
  ...homeActions,
  ...workoutActions,
  ...summaryActions,
  ...editorActions,
  ...settingsActions,
  ...playerActions(showToast),
  'close-sheet': closeSheet,
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  actions[el.dataset.action]?.(el);
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset?.setting) {
    state.settings[t.dataset.setting] = t.checked;
    saveSettings();
    if (state.screen === 'workout') render();
  } else if (t.dataset?.log) {
    onLogInput(t);
  } else if (t.dataset?.settingText !== undefined) {
    onSettingText(t);
  } else if (t.hasAttribute?.('data-import') && t.files?.[0]) {
    importData(t.files[0]);
  }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset?.log) onLogInput(t);
  else if (t.dataset?.edit) onEditorInput(t);
  else if (t.dataset?.settingText !== undefined) onSettingText(t);
});

// When the iOS keyboard closes it can leave the page shifted up.
document.addEventListener('focusout', (e) => {
  if (e.target.matches?.('input, textarea')) setTimeout(resetScroll, 60);
});

// Enter / "done" on the number pad closes the keyboard.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches?.('.logf-val input')) e.target.blur();
});

setInterval(clockTick, 200);

// ---------- Boot ----------

async function boot() {
  applyTheme();
  if (!validSession(state.session)) state.session = null;
  if (state.session && Date.now() - state.session.startedAt < 4 * 3600 * 1000) {
    state.screen = 'workout';
    keepAwake(true);
  }
  render();

  const result = await handleRedirect();
  await initSpotify();
  if (result === 'connected') {
    showToast(`Spotify connected${state.spotify.user ? ` as ${state.spotify.user}` : ''}`);
    settingsSheet();
  } else if (result?.startsWith('error:')) {
    showToast(`Spotify login failed (${result.slice(6)})`);
  }
  if (state.spotify.connected && state.screen === 'workout') render();
}

boot();

// Dev hook for poking at state from the browser console.
if (import.meta.env.DEV) window.__gc = { state, render };
