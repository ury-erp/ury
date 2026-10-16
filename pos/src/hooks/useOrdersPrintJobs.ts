import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { getRealtimeSocket } from '../lib/realtime';
import { usePOSStore } from '../store/pos-store';
import { useRootStore } from '../store/root-store';
import { isPrintStatusDisabled } from '@ury/core';

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
const TABLE_KEYS = ['table', 'restaurant_table'] as const;

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

function addTablesFromPayload(payload: SocketPayload, target: Set<string>) {
  for (const key of TABLE_KEYS) {
    const value = payload?.[key];
    if (typeof value === 'string' && value.trim()) {
      target.add(value.trim());
    }
  }
}

function removeTablesFromPayload(payload: SocketPayload, target: Set<string>) {
  for (const key of TABLE_KEYS) {
    const value = payload?.[key];
    if (typeof value === 'string' && value.trim()) {
      target.delete(value.trim());
    }
  }
}

// Failure events targeted at a specific job owner are only applied for the
// current user. Unowned events (no job_owner, or the current user is not
// known yet) apply to everyone.
function isEventForCurrentUser(payload: SocketPayload): boolean {
  const jobOwner =
    typeof payload?.job_owner === 'string' ? payload.job_owner.trim() : '';
  if (!jobOwner) return true;
  const currentUser = useRootStore.getState().user?.name?.trim();
  if (!currentUser) return true;
  return jobOwner.toLowerCase() === currentUser.toLowerCase();
}

export function useOrdersPrintJobs() {
  const { posProfile } = usePOSStore();
  const printStatusDisabled = isPrintStatusDisabled(posProfile);

  const [failedInvoiceIds, setFailedInvoiceIds] = useState<Set<string>>(new Set());
  const [failedTableNames, setFailedTableNames] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialLoadRef = useRef(true);
  const socketSeenConnectedRef = useRef(false);

  const fetchFailedJobs = useCallback(async () => {
    if (printStatusDisabled) {
      setFailedInvoiceIds(new Set());
      setFailedTableNames(new Set());
      setLoading(false);
      return;
    }

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
          'table',
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
      const tables = new Set<string>();

      if (Array.isArray(rows)) {
        rows.forEach((job) => {
          if (job.invoice) {
            ids.add(String(job.invoice).trim());
          }
          if (job.reference_name) {
            ids.add(String(job.reference_name).trim());
          }
          if (job.table) {
            tables.add(String(job.table).trim());
          }
        });
      }

      setFailedInvoiceIds(ids);
      setFailedTableNames(tables);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch failed print jobs';
      setError(message);
    } finally {
      if (initialLoadRef.current) {
        initialLoadRef.current = false;
        setLoading(false);
      }
    }
  }, [printStatusDisabled]);

  // Initial load only. Socket events fire on transitions and are not replayed,
  // so jobs that FAILED before this screen opened would otherwise never show.
  useEffect(() => {
    fetchFailedJobs();
  }, [fetchFailedJobs]);

  // Event-driven incremental updates; no polling interval. The shared socket
  // resolves asynchronously, so listeners attach once the promise settles and
  // detach on unmount/cleanup.
  useEffect(() => {
    let activeSocket: Socket | null = null;
    let cancelled = false;

    const handleStatusUpdated = (payload: SocketPayload & { status?: string }) => {
      if (!payload?.status) return;
      if (payload.status === 'FAILED' && !isEventForCurrentUser(payload)) return;
      setFailedInvoiceIds((prev) => {
        const next = new Set(prev);
        if (payload.status === 'FAILED') {
          addIdsFromPayload(payload, next);
        } else if (TERMINAL_NON_FAILED_STATUSES.has(payload.status)) {
          removeIdsFromPayload(payload, next);
        }
        return next;
      });
      setFailedTableNames((prev) => {
        const next = new Set(prev);
        if (payload.status === 'FAILED') {
          addTablesFromPayload(payload, next);
        } else if (TERMINAL_NON_FAILED_STATUSES.has(payload.status)) {
          removeTablesFromPayload(payload, next);
        }
        return next;
      });
    };

    const handleFailure = (payload: SocketPayload) => {
      if (!isEventForCurrentUser(payload)) return;
      setFailedInvoiceIds((prev) => {
        const next = new Set(prev);
        addIdsFromPayload(payload, next);
        return next;
      });
      setFailedTableNames((prev) => {
        const next = new Set(prev);
        addTablesFromPayload(payload, next);
        return next;
      });
    };

    const handleCompleted = (payload: SocketPayload) => {
      setFailedInvoiceIds((prev) => {
        const next = new Set(prev);
        removeIdsFromPayload(payload, next);
        return next;
      });
      setFailedTableNames((prev) => {
        const next = new Set(prev);
        removeTablesFromPayload(payload, next);
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

    getRealtimeSocket()
      .then((socket) => {
        if (cancelled) return;
        activeSocket = socket;

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
      })
      .catch((err) => {
        console.error('Failed to subscribe to print job events:', err);
      });

    return () => {
      cancelled = true;
      if (!activeSocket) return;
      activeSocket.off('print_job_status_updated', handleStatusUpdated);
      activeSocket.off('print_failure_alert', handleFailure);
      activeSocket.off('invoice_print_completed', handleCompleted);
      activeSocket.off('kot_print_completed', handleCompleted);
      activeSocket.off('kot_print_failed', handleFailure);
      activeSocket.off('connect', handleConnect);
    };
  }, [fetchFailedJobs]);

  const hasInvoiceFailed = useCallback(
    (invoiceId: string) => {
      if (!invoiceId) return false;
      return failedInvoiceIds.has(String(invoiceId).trim());
    },
    [failedInvoiceIds]
  );

  const hasTableFailed = useCallback(
    (tableName: string) => {
      if (!tableName) return false;
      return failedTableNames.has(String(tableName).trim());
    },
    [failedTableNames]
  );

  return useMemo(
    () => ({
      failedInvoiceIds,
      failedTableNames,
      hasInvoiceFailed,
      hasTableFailed,
      loading,
      error,
      refreshFailedJobs: fetchFailedJobs,
    }),
    [failedInvoiceIds, failedTableNames, loading, error, fetchFailedJobs, hasInvoiceFailed, hasTableFailed]
  );
}
