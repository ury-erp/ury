import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getFrappeSocket } from '../lib/socket';

export interface URYPrintJob {
  name: string;
  print_job_id: string;
  job_type?: string;
  status: string;
  invoice?: string;
  reference_name?: string;
  printer?: string;
  printer_name?: string;
  job_owner?: string;
  table?: string;
  failure_reason?: string;
  created_at?: string;
  retry_count?: number;
  cups_job_id?: number;
}

// Terminal states on print_job_status_updated that are not FAILED. A job in
// one of these states cannot match the status='FAILED' REST filter, so its
// invoice leaves the failed set (parity with the old refetch behaviour).
const TERMINAL_NON_FAILED_STATUSES = new Set(['COMPLETED', 'CANCELED', 'UNKNOWN']);

// Payload keys that identify the document an order card represents.
const ID_KEYS = ['invoice', 'reference_name', 'kot'] as const;

type SocketPayload = Record<string, unknown>;

function addIdsFromPayload(payload: SocketPayload, target: Set<string>) {
  for (const key of ID_KEYS) {
    const value = payload?.[key];
    if (typeof value === 'string' && value.trim()) {
      target.add(value.trim());
    }
  }
}

function removeIdsFromPayload(payload: SocketPayload, target: Set<string>) {
  for (const key of ID_KEYS) {
    const value = payload?.[key];
    if (typeof value === 'string' && value.trim()) {
      target.delete(value.trim());
    }
  }
}

export function useOrdersPrintJobs() {
  const [failedInvoiceIds, setFailedInvoiceIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialLoadRef = useRef(true);
  const socketSeenConnectedRef = useRef(false);

  const fetchFailedJobs = useCallback(async () => {
    if (initialLoadRef.current) {
      setLoading(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams({
        fields: JSON.stringify([
          'name',
          'print_job_id',
          'status',
          'invoice',
          'reference_name',
          'failure_reason',
          'created_at',
        ]),
        filters: JSON.stringify([['status', '=', 'FAILED']]),
      });

      const res = await fetch(`/api/resource/URY%20Print%20Job?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch failed print jobs: ${res.statusText}`);
      }
      const data = await res.json();
      const rows: URYPrintJob[] = data?.data || [];

      const ids = new Set<string>();

      if (Array.isArray(rows)) {
        rows.forEach((job) => {
          if (job.invoice) {
            ids.add(String(job.invoice).trim());
          }
          if (job.reference_name) {
            ids.add(String(job.reference_name).trim());
          }
        });
      }

      setFailedInvoiceIds(ids);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch failed print jobs';
      setError(message);
    } finally {
      if (initialLoadRef.current) {
        initialLoadRef.current = false;
        setLoading(false);
      }
    }
  }, []);

  // Initial load only. Socket events fire on transitions and are not replayed,
  // so jobs that FAILED before this screen opened would otherwise never show.
  useEffect(() => {
    fetchFailedJobs();
  }, [fetchFailedJobs]);

  // Event-driven incremental updates; no polling interval.
  useEffect(() => {
    const socket = getFrappeSocket();

    const handleStatusUpdated = (payload: SocketPayload & { status?: string }) => {
      if (!payload?.status) return;
      setFailedInvoiceIds((prev) => {
        const next = new Set(prev);
        if (payload.status === 'FAILED') {
          addIdsFromPayload(payload, next);
        } else if (TERMINAL_NON_FAILED_STATUSES.has(payload.status)) {
          removeIdsFromPayload(payload, next);
        }
        return next;
      });
    };

    const handleFailure = (payload: SocketPayload) => {
      setFailedInvoiceIds((prev) => {
        const next = new Set(prev);
        addIdsFromPayload(payload, next);
        return next;
      });
    };

    const handleCompleted = (payload: SocketPayload) => {
      setFailedInvoiceIds((prev) => {
        const next = new Set(prev);
        removeIdsFromPayload(payload, next);
        return next;
      });
    };

    // Events fired while the socket was down are lost; resync on reconnect.
    const handleConnect = () => {
      if (socketSeenConnectedRef.current) {
        fetchFailedJobs();
      }
      socketSeenConnectedRef.current = true;
    };

    // The shared socket may already be connected before this hook mounts.
    if (socket.connected) {
      socketSeenConnectedRef.current = true;
    }

    socket.on('print_job_status_updated', handleStatusUpdated);
    socket.on('print_failure_alert', handleFailure);
    socket.on('invoice_print_completed', handleCompleted);
    socket.on('kot_print_completed', handleCompleted);
    socket.on('kot_print_failed', handleFailure);
    socket.on('connect', handleConnect);

    return () => {
      socket.off('print_job_status_updated', handleStatusUpdated);
      socket.off('print_failure_alert', handleFailure);
      socket.off('invoice_print_completed', handleCompleted);
      socket.off('kot_print_completed', handleCompleted);
      socket.off('kot_print_failed', handleFailure);
      socket.off('connect', handleConnect);
    };
  }, [fetchFailedJobs]);

  const hasInvoiceFailed = useCallback(
    (invoiceId: string) => {
      if (!invoiceId) return false;
      return failedInvoiceIds.has(String(invoiceId).trim());
    },
    [failedInvoiceIds]
  );

  return useMemo(
    () => ({
      failedInvoiceIds,
      hasInvoiceFailed,
      loading,
      error,
      refreshFailedJobs: fetchFailedJobs,
    }),
    [failedInvoiceIds, loading, error, fetchFailedJobs, hasInvoiceFailed]
  );
}
