// Spotify Web API with Authorization Code + PKCE (no server, no secret).
// Playback control needs Spotify Premium and an active Spotify app/device;
// iOS Safari can't host the Web Playback SDK, so this remote-controls the
// Spotify app on the phone via Spotify Connect.
import { load, save, remove } from './storage.js';

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com/v1';
const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ');

// Spotify rejects "localhost"; use http://127.0.0.1:5173/ when developing.
export const redirectUri = () => new URL(import.meta.env.BASE_URL, location.origin).href;
export const envClientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID || '';

export class SpotifyError extends Error {
  constructor(status, reason, message) {
    super(message || reason || `Spotify error ${status}`);
    this.status = status;
    this.reason = reason;
  }
}

const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

function randomString(n = 64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (x) => chars[x % chars.length]).join('');
}

export async function login(clientId) {
  const verifier = randomString(64);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const st = randomString(16);
  save('sp.pkce', { verifier, clientId, state: st });
  const q = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES,
    state: st,
  });
  location.assign(`${AUTH_URL}?${q}`);
}

async function tokenRequest(params) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new SpotifyError(res.status, json.error, json.error_description);
  return json;
}

function storeTokens(json, clientId) {
  const prev = load('sp.tokens', {});
  save('sp.tokens', {
    clientId,
    access: json.access_token,
    refresh: json.refresh_token ?? prev.refresh,
    expiresAt: Date.now() + (json.expires_in - 60) * 1000,
  });
}

// Call on boot. Finishes a login redirect if the URL carries ?code=.
// Returns 'connected' | 'error:<reason>' | null.
export async function handleRedirect() {
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  const err = url.searchParams.get('error');
  if (!code && !err) return null;
  const clean = () => history.replaceState(null, '', url.pathname);
  const pkce = load('sp.pkce', null);
  remove('sp.pkce');
  clean();
  if (err) return `error:${err}`;
  if (!pkce || pkce.state !== url.searchParams.get('state')) return 'error:state_mismatch';
  try {
    const json = await tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      client_id: pkce.clientId,
      code_verifier: pkce.verifier,
    });
    storeTokens(json, pkce.clientId);
    return 'connected';
  } catch (e) {
    return `error:${e.reason || e.message}`;
  }
}

export const isConnected = () => !!load('sp.tokens', null)?.refresh;
export const logout = () => remove('sp.tokens');

let refreshing = null;
async function accessToken() {
  const t = load('sp.tokens', null);
  if (!t) throw new SpotifyError(401, 'not_connected');
  if (Date.now() < t.expiresAt) return t.access;
  refreshing ??= tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: t.clientId })
    .then((json) => storeTokens(json, t.clientId))
    .catch((e) => {
      if (e.status === 400) logout(); // Revoked or expired refresh token.
      throw e;
    })
    .finally(() => (refreshing = null));
  await refreshing;
  return load('sp.tokens', null).access;
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204 || res.status === 202) return null;
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new SpotifyError(res.status, json?.error?.reason, json?.error?.message);
  return json;
}

export const me = () => api('/me');
export const playback = () => api('/me/player?additional_types=episode');
export const devices = () => api('/me/player/devices').then((j) => j?.devices ?? []);
export const pause = () => api('/me/player/pause', { method: 'PUT' });
export const next = () => api('/me/player/next', { method: 'POST' });
export const previous = () => api('/me/player/previous', { method: 'POST' });
export const myPlaylists = () => api('/me/playlists?limit=50').then((j) => j?.items ?? []);

export function play({ contextUri, deviceId } = {}) {
  const q = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
  return api(`/me/player/play${q}`, { method: 'PUT', body: contextUri ? { context_uri: contextUri } : undefined });
}

// Start a playlist: prefer the active device, else the phone, else any device.
export async function playPlaylist(playlistId) {
  const contextUri = `spotify:playlist:${playlistId}`;
  try {
    return await play({ contextUri });
  } catch (e) {
    if (e.status !== 404) throw e;
    const list = await devices();
    const target = list.find((d) => d.type === 'Smartphone') ?? list[0];
    if (!target) throw e;
    return play({ contextUri, deviceId: target.id });
  }
}

// Accepts a playlist URL, URI, or bare id.
export function parsePlaylistId(input) {
  const s = String(input || '').trim();
  const m = s.match(/playlist[/:]([A-Za-z0-9]{16,})/) ?? s.match(/^([A-Za-z0-9]{16,})$/);
  return m ? m[1] : null;
}

// Universal link: opens the Spotify app on iOS (or the web player).
export const openUrl = (playlistId) => (playlistId ? `https://open.spotify.com/playlist/${playlistId}` : 'https://open.spotify.com/');
