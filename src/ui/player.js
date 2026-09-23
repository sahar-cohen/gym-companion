// In-app Spotify mini player. Keeping music controls inside the app matters on
// iOS: switching to the Spotify app suspends this page (and its rest timer cues).
import { state, currentWorkout } from '../app/state.js';
import { esc } from '../app/util.js';
import { icon } from './icons.js';
import * as sp from '../lib/spotify.js';

let timer = null;

export function playerHTML() {
  const S = state.spotify;
  if (!S.connected) return '';
  const pl = currentWorkout()?.playlist;
  const pb = S.playback;
  const item = pb?.item;

  if (!item) {
    return `<div class="player is-idle">
      <span class="player-icon">${icon.music}</span>
      <span class="player-text"><b>${S.error === 'no_device' || !pb ? 'Spotify isn’t playing' : 'Nothing playing'}</b>
        <small>${pl ? esc(pl.name) : 'Open Spotify once, then control it here'}</small></span>
      ${pl && S.premium ? `<button class="player-btn" data-action="sp-start" aria-label="Play workout playlist">${icon.play}</button>` : ''}
      <a class="player-link" href="${sp.openUrl(pl?.id)}" target="_blank" rel="noopener">Open</a>
    </div>`;
  }

  const art = item.album?.images?.at(-1)?.url ?? item.images?.at(-1)?.url;
  const artist = item.artists?.map((a) => a.name).join(', ') ?? item.show?.name ?? '';
  const playing = pb.is_playing;
  const controls = S.premium
    ? `<button class="player-btn" data-action="sp-prev" aria-label="Previous track">${icon.trackPrev}</button>
       <button class="player-btn is-main" data-action="sp-toggle" aria-label="${playing ? 'Pause' : 'Play'}">${playing ? icon.pause : icon.play}</button>
       <button class="player-btn" data-action="sp-next" aria-label="Next track">${icon.trackNext}</button>`
    : `<a class="player-link" href="${sp.openUrl()}" target="_blank" rel="noopener">Open</a>`;
  return `<div class="player">
    ${art ? `<img class="player-art" src="${esc(art)}" alt="" width="40" height="40">` : `<span class="player-icon">${icon.music}</span>`}
    <span class="player-text"><b>${esc(item.name)}</b><small>${esc(artist)}</small></span>
    ${controls}
  </div>`;
}

function paint() {
  const el = document.getElementById('player-slot');
  if (el) el.innerHTML = playerHTML();
}

// Spotify takes a moment to reflect a command. Polls that started before the
// latest tap (or land within its settle window) are ignored so the optimistic
// UI doesn't flicker back.
let actionSeq = 0;
let settleUntil = 0;

export async function refreshPlayback() {
  if (!state.spotify.connected) return;
  const seq = actionSeq;
  if (Date.now() < settleUntil) return;
  try {
    const pb = await sp.playback();
    if (seq !== actionSeq || Date.now() < settleUntil) return;
    state.spotify.playback = pb;
    state.spotify.error = null;
  } catch (e) {
    state.spotify.error = e.reason || e.message;
    if (e.status === 401 || e.status === 400) state.spotify.connected = sp.isConnected();
  }
  paint();
}

export function startPolling() {
  if (timer || !state.spotify.connected) return;
  refreshPlayback();
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') refreshPlayback();
  }, 5000);
}

export function stopPolling() {
  clearInterval(timer);
  timer = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && timer) refreshPlayback();
});

// Loads the profile to learn whether playback control is available.
export async function initSpotify() {
  state.spotify.connected = sp.isConnected();
  if (!state.spotify.connected) return;
  try {
    const me = await sp.me();
    state.spotify.user = me.display_name || me.id;
    // "product" was removed from /me for some dev-mode apps; assume Premium
    // unless a control call later says otherwise.
    state.spotify.premium = me.product ? me.product === 'premium' : true;
  } catch (e) {
    state.spotify.connected = sp.isConnected();
  }
}

let busy = false;

// optimistic(): update the UI right away; returns an undo for failures.
async function control(fn, toast, { optimistic, settle = 1500 } = {}) {
  if (busy) return; // ignore double taps while a command is in flight
  busy = true;
  actionSeq++;
  settleUntil = Date.now() + settle;
  const undo = optimistic?.();
  paint();
  try {
    await fn();
    // Check Spotify's real state once it has caught up.
    setTimeout(refreshPlayback, settle + 50);
  } catch (e) {
    undo?.();
    settleUntil = 0;
    paint();
    if (e.reason === 'PREMIUM_REQUIRED') {
      state.spotify.premium = false;
      paint();
      toast?.('Playback control needs Spotify Premium');
    } else if (e.status === 404) {
      toast?.('Open Spotify on your phone first');
    } else {
      toast?.('Spotify didn’t respond');
    }
  } finally {
    busy = false;
  }
}

function togglePlaying() {
  const pb = state.spotify.playback;
  if (!pb) return undefined;
  const was = pb.is_playing;
  pb.is_playing = !was;
  return () => (pb.is_playing = was);
}

export function playerActions(toast) {
  return {
    'sp-toggle': () => {
      const playing = state.spotify.playback?.is_playing;
      control(() => (playing ? sp.pause() : sp.play()), toast, { optimistic: togglePlaying });
    },
    // Track changes show up a bit later; refresh once they have.
    'sp-next': () => control(sp.next, toast, { settle: 900 }),
    'sp-prev': () => control(sp.previous, toast, { settle: 900 }),
    'sp-start': () => {
      const pl = currentWorkout()?.playlist;
      if (pl) control(() => sp.playPlaylist(pl.id), toast);
    },
  };
}

// Starts the workout playlist if one is set; quiet when it can't.
export async function autoStartPlaylist(workout, toast) {
  if (!state.spotify.connected || !state.spotify.premium || !workout.playlist) return;
  try {
    await sp.playPlaylist(workout.playlist.id);
    setTimeout(refreshPlayback, 600);
  } catch (e) {
    if (e.status === 404) toast?.('Open Spotify to start your playlist');
  }
}
