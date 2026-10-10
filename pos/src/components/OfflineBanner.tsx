import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, Loader2, Upload } from 'lucide-react';
import { showToast } from '@ury/ui';
import { t, tPlural } from '../i18n';
import { useConnectivity } from '../lib/connectivity';
import { flushQueue, subscribeToQueue, type QueuedOrder } from '../lib/sync-queue';

/**
 * A standing notice that the till cannot reach the server.
 *
 * Deliberately a bar that pushes the page down rather than a toast: a toast
 * describes a moment, and this is a condition that lasts until it is fixed.
 * A cashier who dismissed it would keep working as if nothing were wrong,
 * which is the failure this exists to prevent.
 */
const OfflineBanner: React.FC = () => {
  const { state, isOffline, checkNow } = useConnectivity();
  const [checking, setChecking] = useState(false);
  const [queued, setQueued] = useState<QueuedOrder[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => subscribeToQueue(setQueued), []);

  const send = async () => {
    setSending(true);
    try {
      const result = await flushQueue();
      if (result.sent) {
        showToast.success(tPlural('offline.queue_sent', result.sent));
      }
      if (result.rejected.length) {
        // Refused orders are gone from the queue, so the cashier has to be
        // told rather than left to discover the missing table later.
        showToast.error(tPlural('offline.queue_rejected', result.rejected.length));
      }
    } finally {
      setSending(false);
    }
  };

  // Drain as soon as the link is confirmed back, without waiting for anyone
  // to notice the banner.
  useEffect(() => {
    if (state === 'online' && queued.length > 0 && !sending) {
      send();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, queued.length]);

  // The backlog outlives the outage: it stays visible until it is delivered,
  // because an order sitting on this terminal is an order nobody is cooking.
  if (!isOffline && queued.length === 0) {
    return null;
  }

  if (!isOffline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-[#8a5a00] px-4 py-2 text-center text-sm font-medium text-white"
      >
        <Upload className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{tPlural('offline.queued_count', queued.length)}</span>
        <button
          onClick={send}
          disabled={sending}
          className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-2.5 py-1 text-xs font-semibold hover:bg-white/25 disabled:opacity-60"
        >
          {sending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {t('offline.send_now')}
        </button>
      </div>
    );
  }

  const handleCheck = async () => {
    setChecking(true);
    try {
      await checkNow();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-[#b3261e] px-4 py-2 text-center text-sm font-medium text-white"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{t('offline.title')}</span>
      <span className="text-white/80">
        {queued.length > 0 ? tPlural('offline.queued_count', queued.length) : t('offline.hint')}
      </span>
      <button
        onClick={handleCheck}
        disabled={checking}
        className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-2.5 py-1 text-xs font-semibold hover:bg-white/25 disabled:opacity-60"
      >
        {checking ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {t('offline.check_again')}
      </button>
    </div>
  );
};

export default OfflineBanner;
