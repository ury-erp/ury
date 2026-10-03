import { useCallback, useEffect, useRef } from 'react';
import { call, printWithQz } from '@ury/core';
import { showToast } from '@ury/ui';
import { usePOSStore } from '../store/pos-store';
import { getRealtimeSocket } from '../lib/realtime';
import { t } from '../i18n';

/**
 * Prints the branch's queued jobs (kitchen tickets, dashboard reprints)
 * through this computer's QZ Tray.
 *
 * Runs on every POS screen of a QZ branch. Jobs are claimed atomically on
 * the server (ury.ury.api.qz_printing.claim_jobs), so with several screens
 * open each job still prints once; a realtime nudge makes it immediate and
 * the poll covers a missed nudge or a screen that was off.
 */

const API = 'ury.ury.api.qz_printing';
const POLL_MS = 20_000;

interface PrintJob {
  name: string;
  printer: string;
  reference_doctype: string;
  reference_name: string;
  html: string;
}

function stationId(): string {
  const key = 'ury_qz_station';
  try {
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return `tab-${Math.random().toString(36).slice(2, 10)}`;
  }
}

const QzPrintAgent: React.FC = () => {
  const { posProfile } = usePOSStore();
  const enabled = posProfile?.print_type === 'qz' && !!posProfile?.branch;
  const host = posProfile?.qz_host || 'localhost';
  const branch = posProfile?.branch || '';

  const running = useRef(false);
  const again = useRef(false);
  const warned = useRef(false);
  const station = useRef(stationId());

  const drain = useCallback(async () => {
    if (!enabled) return;
    // One run at a time; a nudge during a run schedules exactly one more.
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    try {
      do {
        again.current = false;
        const res = await call<unknown>(`${API}.claim_jobs`, { branch, station: station.current });
        const jobs = ((res as { message?: PrintJob[] })?.message ?? res ?? []) as PrintJob[];
        for (const job of jobs) {
          try {
            await printWithQz(host, job.html, job.printer);
            await call(`${API}.complete_job`, { job: job.name, ok: 1 });
            warned.current = false;
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            await call(`${API}.complete_job`, { job: job.name, ok: 0, error: reason }).catch(() => {});
            if (!warned.current) {
              // Once per streak, not once per ticket: a disconnected QZ would
              // otherwise bury the cashier in identical toasts.
              warned.current = true;
              showToast.error(t('qz.print_failed', { printer: job.printer, reason }));
            }
          }
        }
        if (jobs.length >= 10) again.current = true;
      } while (again.current);
    } catch (err) {
      console.error('QZ print agent:', err);
    } finally {
      running.current = false;
    }
  }, [enabled, branch, host]);

  useEffect(() => {
    if (!enabled) return;
    void drain();
    const timer = window.setInterval(() => void drain(), POLL_MS);

    const channel = `ury_print_jobs_${branch}`;
    const onJob = () => void drain();
    let unsubscribe: (() => void) | null = null;
    getRealtimeSocket()
      .then((socket) => {
        socket.on(channel, onJob);
        unsubscribe = () => socket.off(channel, onJob);
      })
      .catch(() => {
        // The poll still delivers jobs, just less promptly.
      });

    return () => {
      window.clearInterval(timer);
      unsubscribe?.();
    };
  }, [enabled, branch, drain]);

  return null;
};

export default QzPrintAgent;
