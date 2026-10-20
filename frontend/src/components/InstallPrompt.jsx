import { useState, useEffect } from 'react';
import { subscribe, isStandalone, isIosSafari, canPrompt, promptInstall } from '../pwa/install.js';

const DISMISSED_KEY = 'installPromptDismissedUntil';
const SNOOZE_DAYS = 14;

const snoozed = () => {
  try {
    const until = Number(localStorage.getItem(DISMISSED_KEY) || 0);
    return Date.now() < until;
  } catch {
    return false;
  }
};

const snooze = () => {
  try {
    localStorage.setItem(DISMISSED_KEY, String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000));
  } catch {
    // Private browsing. The banner will just come back next time.
  }
};

/**
 * Offers to install the app to the home screen.
 *
 * Chrome fires beforeinstallprompt when the app qualifies (served over HTTPS, a manifest with
 * icons, and a service worker that handles fetch). Holding on to that event lets us ask at a
 * sensible moment with our own wording, rather than leaving it to the browser's mini-infobar.
 */
export default function InstallPrompt() {
  const [offer, setOffer] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (isStandalone() || snoozed()) return undefined;
    setOffer(canPrompt());
    if (isIosSafari()) setShowIosHint(true);
    // The event itself is captured in pwa/install.js, so the Settings card can use it too.
    return subscribe(() => setOffer(canPrompt()));
  }, []);

  const install = async () => {
    setInstalling(true);
    try {
      const outcome = await promptInstall();
      if (outcome === 'dismissed') snooze();
      setHidden(true);
    } finally {
      setInstalling(false);
    }
  };

  const dismiss = () => {
    snooze();
    setHidden(true);
  };

  const deferred = offer;
  if (hidden || (!offer && !showIosHint)) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: `calc(12px + env(safe-area-inset-bottom, 0px))`,
        zIndex: 500,
        maxWidth: 440,
        margin: '0 auto',
        background: 'var(--surface)',
        borderRadius: 12,
        boxShadow: '0 10px 25px rgba(0,0,0,0.18)',
        border: '1px solid var(--border)',
        padding: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <img
        src="/icons/icon-192.png"
        alt=""
        width={44}
        height={44}
        style={{ borderRadius: 10, flex: '0 0 auto' }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>Install FWR Recyclers</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
          {showIosHint
            ? <>Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</>
            : 'Add it to your home screen and open it like any other app.'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>
        {deferred && (
          <button className="btn-primary btn-sm" onClick={install} disabled={installing}>
            {installing ? '…' : 'Install'}
          </button>
        )}
        <button className="btn-ghost btn-sm" onClick={dismiss} aria-label="Dismiss">
          {showIosHint && !deferred ? 'Got it' : 'Not now'}
        </button>
      </div>
    </div>
  );
}
