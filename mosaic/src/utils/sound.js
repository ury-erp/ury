/**
 * Audio alerts for the kitchen display.
 *
 * Three problems make this more than `new Audio(url).play()`:
 *
 *  1. Browsers block audio until the page has been interacted with. The old
 *     code called `.play()` and let the rejected promise disappear, so a
 *     display left untouched after a reload was silent with no indication of
 *     why. Here the blocked state is observable, so the UI can ask for a tap.
 *  2. The alert URL came from an optional POS Profile attachment. When it was
 *     not set the code built `origin + null` and requested a 404. Bundled
 *     tones are the default; an uploaded file, when present, overrides them.
 *  3. A kitchen is loud and tickets arrive in bursts. Elements are pooled so
 *     overlapping alerts do not cut each other off, and a burst collapses to
 *     one alert instead of five.
 */

const STORAGE_KEY = 'ury_kds_sound';

/** Bundled tones. Vite rewrites these to hashed, base-prefixed asset URLs. */
const BUILT_IN = {
  new_order: new URL('../assets/sounds/new-order.wav', import.meta.url).href,
  modified: new URL('../assets/sounds/order-modified.wav', import.meta.url).href,
  cancelled: new URL('../assets/sounds/order-cancelled.wav', import.meta.url).href,
  late: new URL('../assets/sounds/order-late.wav', import.meta.url).href,
  served: new URL('../assets/sounds/order-served.wav', import.meta.url).href,
};

/**
 * Minimum gap between two alerts of the same kind, in ms.
 *
 * Six tickets firing at once is one event to a cook, not six; without this the
 * chimes queue up and the board is still chiming after the last ticket lands.
 * `served` is exempt-ish (short window) because it confirms a deliberate tap
 * and must feel immediate.
 */
const THROTTLE_MS = { new_order: 1200, modified: 1200, cancelled: 1200, late: 4000, served: 120 };

function readSettings() {
  // Blocked site data must not stop the kitchen from booting.
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

const stored = readSettings();

const state = {
  muted: stored.muted === true,
  volume: typeof stored.volume === 'number' ? Math.min(1, Math.max(0, stored.volume)) : 0.8,
  /** True once the browser has actually let us play something. */
  unlocked: false,
  /** True when a play attempt was rejected — the UI prompts for a tap. */
  blocked: false,
  /** Custom per-event URLs from the POS Profile, when configured. */
  overrides: {},
  lastPlayed: {},
  listeners: new Set(),
};

function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ muted: state.muted, volume: state.volume })
    );
  } catch {
    /* Private mode: the setting simply does not survive a reload. */
  }
}

function notify() {
  state.listeners.forEach((fn) => {
    try {
      fn(snapshot());
    } catch (err) {
      console.error('sound listener failed', err);
    }
  });
}

/**
 * A small pool per tone.
 *
 * A single Audio element cannot overlap with itself: re-triggering it restarts
 * playback mid-tone, which in a burst produces a stutter rather than a chime.
 * Three elements is enough for any realistic burst once throttling is applied.
 */
const pools = new Map();

function pool(url) {
  if (!pools.has(url)) {
    const elements = Array.from({ length: 3 }, () => {
      const el = new Audio(url);
      el.preload = 'auto';
      return el;
    });
    pools.set(url, { elements, next: 0 });
  }
  return pools.get(url);
}

function resolveUrl(kind) {
  return state.overrides[kind] || BUILT_IN[kind] || BUILT_IN.new_order;
}

function snapshot() {
  return { muted: state.muted, volume: state.volume, blocked: state.blocked, unlocked: state.unlocked };
}

/** Subscribe to mute/volume/blocked changes. Returns an unsubscribe function. */
export function onSoundChange(fn) {
  state.listeners.add(fn);
  fn(snapshot());
  return () => state.listeners.delete(fn);
}

export function getSoundState() {
  return snapshot();
}

export function isMuted() {
  return state.muted;
}

export function setMuted(muted) {
  state.muted = !!muted;
  persist();
  notify();
}

export function toggleMuted() {
  setMuted(!state.muted);
  return state.muted;
}

export function setVolume(volume) {
  state.volume = Math.min(1, Math.max(0, Number(volume) || 0));
  persist();
  notify();
}

export function getVolume() {
  return state.volume;
}

/**
 * Point one or more alert kinds at custom files.
 *
 * Only non-empty values override, so an unset POS Profile attachment leaves
 * the bundled tone in place instead of blanking it.
 */
export function setOverrides(map) {
  Object.entries(map || {}).forEach(([kind, url]) => {
    if (url) state.overrides[kind] = url;
  });
}

/** Warm the browser cache so the first real alert is not late. */
export function preload() {
  Object.keys(BUILT_IN).forEach((kind) => pool(resolveUrl(kind)));
}

/**
 * Plays an alert. Never throws and never rejects: an audio failure must not
 * take down the socket handler that fired it.
 *
 * @param {string} kind one of the keys of BUILT_IN
 * @param {{force?: boolean}} [options] `force` bypasses the burst throttle
 */
export function play(kind, options = {}) {
  if (state.muted) return;

  const now = Date.now();
  const gap = THROTTLE_MS[kind] ?? 1000;
  if (!options.force && now - (state.lastPlayed[kind] || 0) < gap) return;
  state.lastPlayed[kind] = now;

  const { elements } = pool(resolveUrl(kind));
  const el = elements[pools.get(resolveUrl(kind)).next % elements.length];
  pools.get(resolveUrl(kind)).next += 1;

  el.volume = state.volume;
  el.currentTime = 0;

  const attempt = el.play();
  if (attempt && typeof attempt.catch === 'function') {
    attempt
      .then(() => {
        if (!state.unlocked || state.blocked) {
          state.unlocked = true;
          state.blocked = false;
          notify();
        }
      })
      .catch(() => {
        // Almost always the autoplay policy. Surface it rather than swallow it.
        if (!state.blocked) {
          state.blocked = true;
          notify();
        }
      });
  }
}

/**
 * Satisfies the autoplay policy from inside a real user gesture.
 *
 * Playing a muted, immediately-paused element is the standard way to mark the
 * page as user-activated for audio without the user hearing anything.
 */
export function unlock() {
  if (state.unlocked) return Promise.resolve(true);

  const el = new Audio(BUILT_IN.served);
  el.volume = 0;
  const attempt = el.play();
  const done = attempt && typeof attempt.then === 'function' ? attempt : Promise.resolve();

  return done
    .then(() => {
      el.pause();
      state.unlocked = true;
      state.blocked = false;
      preload();
      notify();
      return true;
    })
    .catch(() => false);
}

/**
 * Installs one-shot gesture listeners that unlock audio on the first touch,
 * click or key anywhere in the page. Returns a teardown function.
 */
export function installUnlockOnFirstGesture() {
  const events = ['pointerdown', 'keydown', 'touchstart'];

  const handler = () => {
    unlock().then((ok) => {
      if (ok) teardown();
    });
  };

  const teardown = () => events.forEach((e) => window.removeEventListener(e, handler));
  events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
  return teardown;
}

/** Plays the new-order tone regardless of mute, for the "test sound" button. */
export function preview(kind = 'new_order') {
  const wasMuted = state.muted;
  state.muted = false;
  play(kind, { force: true });
  state.muted = wasMuted;
}
