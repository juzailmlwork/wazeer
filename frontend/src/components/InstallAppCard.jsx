import { useState, useEffect, useCallback } from 'react';
import {
  subscribe, isStandalone, canPrompt, promptInstall,
  detectInstalled, isIos, isIosSafari, wasJustInstalled,
} from '../pwa/install.js';

const Line = ({ kind, children }) => {
  const palette = {
    success: { bg: '#dcfce7', fg: '#15803d' },
    info: { bg: '#e0f2fe', fg: '#0369a1' },
    warning: { bg: '#fef3c7', fg: '#92400e' },
  }[kind];
  return (
    <div style={{ background: palette.bg, color: palette.fg, borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
      {children}
    </div>
  );
};

/**
 * Install the app to the home screen, from Settings.
 *
 * Being straight about what is knowable matters more than showing a tidy badge:
 *
 *   running in the app   definite, from the display-mode media query
 *   installed            definite on Chromium, via getInstalledRelatedApps
 *   not installed        definite when Chrome has offered us the install prompt
 *   unknown              everywhere else — Safari, Firefox and all of iOS have no
 *                        way to tell, so the card says so rather than guessing
 */
export default function InstallAppCard() {
  const [standalone] = useState(isStandalone);
  const [promptable, setPromptable] = useState(canPrompt);
  const [installed, setInstalled] = useState(undefined); // undefined = still checking
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState('');
  const [justInstalled, setJustInstalled] = useState(wasJustInstalled);

  const refresh = useCallback(() => { detectInstalled().then(setInstalled); }, []);

  useEffect(() => {
    refresh();
    return subscribe(() => {
      setPromptable(canPrompt());
      setJustInstalled(wasJustInstalled());
      refresh();
    });
  }, [refresh]);

  const install = async () => {
    setBusy(true);
    setOutcome('');
    try {
      const result = await promptInstall();
      if (result === 'accepted') setOutcome('Installed. Look for FWR Recyclers on your home screen.');
      else if (result === 'dismissed') setOutcome('Not installed — you can start it again any time.');
      refresh();
    } finally {
      setBusy(false);
    }
  };

  // Order matters. The appinstalled event is believed over getInstalledRelatedApps,
  // which can lag behind a fresh install. iOS is checked before the "not installed"
  // branch because that branch's advice — use the Chrome menu — is wrong there, and
  // because iOS cannot report installed state at all.
  const status = standalone ? 'running'
    : (justInstalled || installed === true) ? 'installed'
    : isIos() ? 'ios'
    : promptable ? 'installable'
    : installed === false ? 'not-installed'
    : 'unknown';

  return (
    <>
      {status === 'running' && (
        <Line kind="success"><strong>You are using the installed app.</strong> Nothing more to do here.</Line>
      )}

      {status === 'installed' && (
        <Line kind="success">
          <strong>Installed on this device.</strong> Open FWR Recyclers from your home screen or app list
          to use it without the browser bar.
        </Line>
      )}

      {status === 'installable' && (
        <>
          <Line kind="info">Not installed on this device yet.</Line>
          <button className="btn-primary" style={{ marginTop: 12 }} onClick={install} disabled={busy}>
            {busy ? 'Waiting for your confirmation…' : '⬇ Install App'}
          </button>
        </>
      )}

      {status === 'not-installed' && (
        <>
          <Line kind="info">Not installed on this device.</Line>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 10 }}>
            Your browser has not offered the install button yet. In Chrome, open the <strong>⋮</strong> menu
            and choose <strong>Install app</strong> (on a phone, <strong>Add to Home screen</strong>).
          </p>
        </>
      )}

      {status === 'ios' && (
        <>
          <Line kind="info">
            iPhone and iPad cannot report whether the app is installed, so this has to be checked
            on the home screen.
          </Line>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 10 }}>
            {isIosSafari() ? (
              <>Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>. Apple allows no install
                 button, so this is the only way.</>
            ) : (
              <>Only <strong>Safari</strong> can add an app to the home screen on iPhone and iPad. Open this page
                 in Safari, then tap <strong>Share</strong> → <strong>Add to Home Screen</strong>.</>
            )}
            {' '}The installed app keeps its own session, so you will sign in once more inside it.
          </p>
        </>
      )}

      {status === 'unknown' && (
        <>
          <Line kind="warning">This browser cannot tell whether the app is installed.</Line>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 10 }}>
            Installing works best in <strong>Chrome</strong> or <strong>Edge</strong>. Open the browser menu and
            look for <strong>Install app</strong>.
          </p>
        </>
      )}

      {outcome && <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 10 }}>{outcome}</p>}
    </>
  );
}
