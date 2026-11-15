import { useCallback, useEffect, useRef, useState } from 'react';
import { logout } from '@ury/core';
import { useRootStore } from '../store/root-store';
import { clearTabCache, getStationSession } from '../lib/station';
import { t } from '../i18n';

/**
 * Shown only for a session started with a PIN at a station: a "Done" button
 * that hands the screen to the next waiter, and sign-out after a period
 * with no touches. Renders nothing for a normal login.
 */
const StationSession = () => {
  const session = getStationSession();
  const { user } = useRootStore();
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastActivity = useRef(Date.now());
  const signingOut = useRef(false);

  const signOut = useCallback(async () => {
    if (!session || signingOut.current) return;
    signingOut.current = true;
    try {
      await logout();
    } catch {
      // Offline: the station page ends the session on the server when it loads.
    }
    clearTabCache();
    // replace(), so Back never returns to this waiter's screen.
    window.location.replace(session.station_page);
  }, [session]);

  useEffect(() => {
    if (!session) return;

    const idleMs = session.idle_seconds * 1000;
    const warnMs = Math.min(session.warning_seconds * 1000, idleMs - 5000);

    const onActivity = () => {
      lastActivity.current = Date.now();
      setSecondsLeft(null);
    };
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;
    events.forEach((name) => document.addEventListener(name, onActivity, { capture: true, passive: true }));

    const timer = window.setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= idleMs) {
        signOut();
      } else if (idle >= idleMs - warnMs) {
        setSecondsLeft(Math.ceil((idleMs - idle) / 1000));
      }
    }, 1000);

    // Back button after signing out: the browser may show this page again
    // from its memory cache without asking the server.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.replace(session.station_page);
    };
    window.addEventListener('pageshow', onPageShow);

    return () => {
      events.forEach((name) => document.removeEventListener(name, onActivity, { capture: true }));
      window.clearInterval(timer);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [session, signOut]);

  if (!session) return null;

  return (
    <>
      {/* Top centre: the POS headers keep that area free, and the bottom edge
          belongs to the order page's own action bar. */}
      <div
        id="station-session-bar"
        className="fixed left-1/2 top-2 z-[1000] flex -translate-x-1/2 items-center gap-3 rounded-full bg-gray-900 py-1 pl-4 pr-1 text-white shadow-lg max-w-[calc(100vw-1.5rem)]"
      >
        <span className="truncate text-sm font-semibold">{user?.full_name || user?.name}</span>
        <button
          type="button"
          onClick={signOut}
          className="whitespace-nowrap rounded-full bg-green-600 px-5 py-2.5 text-base font-bold text-white active:bg-green-700"
        >
          {t('station.done')}
        </button>
      </div>

      {secondsLeft !== null && (
        <div
          id="station-idle-warning"
          className="fixed inset-0 z-[1001] flex items-center justify-center bg-gray-900/75 p-4"
          role="alertdialog"
          aria-live="assertive"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-7 text-center">
            <div className="mb-2 text-2xl font-bold text-gray-900">{t('station.still_there')}</div>
            <div className="mb-5 text-base text-gray-600">
              {t('station.signing_out_in', { seconds: secondsLeft })}
            </div>
            {/* No handler needed: any touch counts as activity and closes this. */}
            <button
              type="button"
              className="w-full rounded-xl bg-blue-700 p-4 text-lg font-bold text-white"
            >
              {t('station.keep_working')}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default StationSession;
