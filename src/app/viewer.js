// One shared 3D viewer; screens move its canvas into their own slot.
import { Viewer } from '../three/viewer.js';
import { state } from './state.js';
import { save } from '../lib/storage.js';

let viewer = null;

export function getViewer() {
  if (viewer) return viewer;
  viewer = new Viewer();
  viewer.setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  viewer.el.addEventListener(
    'pointerdown',
    () => {
      if (state.hintSeen) return;
      state.hintSeen = true;
      save('hintSeen', true);
      document.getElementById('stage-hint')?.remove();
    },
    { passive: true },
  );
  return viewer;
}

export const existingViewer = () => viewer;
