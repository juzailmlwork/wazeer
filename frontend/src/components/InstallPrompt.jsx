import { useState, useEffect } from 'react';

const DISMISSED_KEY = 'installPromptDismissedUntil';
const SNOOZE_DAYS = 14;

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

// iOS has no beforeinstallprompt, so Safari users get instructions instead of a button.
const isIosSafari = () => {
  const ua = window.navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
};

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
  const [deferred, setDeferred] = useState(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (isStandalone() || snoozed()) return;

    const onBeforeInstall = (e) => {
      // Keep the browser's own banner away; we show our own.
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => {
      setDeferred(null);
      setShowIosHint(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    if (isIosSafari()) setShowIosHint(true);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferred) return;
    setInstalling(true);
    try {
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      // The event can only be used once, either way.
      setDeferred(null);
      if (outcome === 'dismissed') snooze();
    } finally {
      setInstalling(false);
    }
  };

  const dismiss = () => {
    snooze();
    setDeferred(null);
    setShowIosHint(false);
  };

  if (!deferred && !showIosHint) return null;

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
