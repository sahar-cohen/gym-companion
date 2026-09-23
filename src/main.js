import '@fontsource/barlow-semi-condensed/500.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/barlow-semi-condensed/700.css';
import './styles.css';
import { registerSW } from 'virtual:pwa-register';

import { state, setRender, render, validSession, persistSession } from './app/state.js';
import { existingViewer } from './app/viewer.js';
import { keepAwake } from './lib/device.js';
import { closeSheet, resetScroll, setBaseTheme } from './ui/sheets.js';
import { renderHome, homeActions } from './screens/home.js';
import { renderPlan, planActions } from './screens/plan.js';
import { renderExercise, libraryActions } from './screens/library.js';
import { renderWorkout, leaveWorkout, workoutActions, onVoiceSetting } from './screens/workout.js';
import { renderSummary, summaryActions } from './screens/summary.js';
import { renderEditor, editorActions, onEditorInput } from './screens/editor.js';
import { settingsActions, setApplyTheme, importData } from './screens/settings.js';
import { stageActions } from './ui/technique.js';

registerSW({ immediate: true });

const app = document.getElementById('app');

// ---------- Theme ----------

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = state.settings.theme === 'system' ? (darkQuery.matches ? 'dark' : 'light') : state.settings.theme;
  document.documentElement.dataset.theme = t;
  setBaseTheme(t === 'dark' ? '#0d0e10' : '#f4f3ef');
  existingViewer()?.setTheme(t);
  existingViewer()?.renderOnce();
}
darkQuery.addEventListener?.('change', applyTheme);
setApplyTheme(applyTheme);

// ---------- Router ----------

const SCREENS = { home: renderHome, plan: renderPlan, exercise: renderExercise, workout: renderWorkout, done: renderSummary, editor: renderEditor };

let lastScreen = null;
setRender(() => {
  existingViewer()?.stop();
  if (lastScreen === 'workout' && state.screen !== 'workout') leaveWorkout();
  if (state.screen === 'workout' && !state.session) state.screen = 'home';
  if (state.screen === 'done' && !state.summary) state.screen = 'home';
  if (state.screen === 'editor' && !state.editor) state.screen = 'home';
  if (state.screen === 'exercise' && !state.detail) state.screen = 'home';
  lastScreen = state.screen;
  document.body.dataset.screen = state.screen;
  (SCREENS[state.screen] ?? renderHome)(app);
});

// ---------- Events ----------

const actions = {
  ...homeActions,
  ...planActions,
  ...libraryActions,
  ...workoutActions,
  ...summaryActions,
  ...editorActions,
  ...settingsActions,
  ...stageActions,
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
    if (t.dataset.setting === 'voice') onVoiceSetting();
  } else if (t.hasAttribute?.('data-import') && t.files?.[0]) {
    importData(t.files[0]);
  }
});

document.addEventListener('input', (e) => {
  if (e.target.dataset?.edit) onEditorInput(e.target);
});

// When the iOS keyboard closes it can leave the page shifted up.
document.addEventListener('focusout', (e) => {
  if (e.target.matches?.('input, textarea')) setTimeout(resetScroll, 60);
});

// ---------- Boot ----------

function boot() {
  applyTheme();
  if (!validSession(state.session)) {
    state.session = null;
    persistSession();
  }
  if (state.session && Date.now() - state.session.startedAt < 4 * 3600 * 1000) {
    state.screen = 'workout';
    keepAwake(true);
  }
  render();
}

boot();

// Dev hook for poking at state from the browser console.
if (import.meta.env.DEV) window.__gc = { state, render };
