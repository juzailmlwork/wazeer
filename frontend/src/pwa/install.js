// Shared install state for the whole app.
//
// `beforeinstallprompt` fires once and the event can only be used once, so whichever
// component listened first would own it. Both the banner and the Settings card need it,
// hence one module-level listener that everything subscribes to. Imported from main.jsx
// so the listener is registered before the event can fire.

const listeners = new Set();
let deferred = null;      // the captured beforeinstallprompt event, or null
let justInstalled = false;

const emit = () => listeners.forEach((fn) => fn());

window.addEventListener('beforeinstallprompt', (e) => {
  // Chrome does not fire this when the app is already installed, so its arrival is
  // also a reasonably strong signal that it is not.
  e.preventDefault();
  deferred = e;
  justInstalled = false;
  emit();
});

window.addEventListener('appinstalled', () => {
  deferred = null;
  justInstalled = true;
  emit();
});

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** True only while running inside the installed app — not merely because it is installed. */
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: window-controls-overlay)').matches ||
  window.navigator.standalone === true;

export const canPrompt = () => deferred !== null;
export const wasJustInstalled = () => justInstalled;

/** iOS has no install API at all: Safari's Share > Add to Home Screen is the only route. */
export function isIos() {
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export const isIosSafari = () =>
  isIos() && /Safari/.test(window.navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(window.navigator.userAgent);

/** Returns 'accepted', 'dismissed', or 'unavailable'. The event is single-use either way. */
export async function promptInstall() {
  if (!deferred) return 'unavailable';
  const e = deferred;
  deferred = null;
  emit();
  e.prompt();
  const { outcome } = await e.userChoice;
  return outcome;
}

/**
 * Is this app already installed on this device?
 *
 *   true  — yes
 *   false — no
 *   null  — cannot be determined on this browser (Safari, Firefox, iOS, anything
 *           without getInstalledRelatedApps)
 *
 * Works because the manifest lists itself under related_applications with
 * platform "webapp"; without that entry this always comes back empty.
 */
export async function detectInstalled() {
  if (!navigator.getInstalledRelatedApps) return null;
  try {
    const apps = await navigator.getInstalledRelatedApps();
    return apps.some((a) => a.platform === 'webapp');
  } catch {
    return null;
  }
}
