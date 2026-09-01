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

const POLL_INTERVAL_MS = 5000;

export function useOrdersPrintJobs() {
  const [failedInvoiceIds, setFailedInvoiceIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialLoadRef = useRef(true);

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

  useEffect(() => {
    fetchFailedJobs();
    const intervalId = setInterval(fetchFailedJobs, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [fetchFailedJobs]);

  useEffect(() => {
    const socket = getFrappeSocket();

    socket.on('print_job_status_updated', fetchFailedJobs);
    socket.on('print_failure_alert', fetchFailedJobs);
    socket.on('invoice_print_completed', fetchFailedJobs);
    socket.on('kot_print_completed', fetchFailedJobs);
    socket.on('kot_print_failed', fetchFailedJobs);

    return () => {
      socket.off('print_job_status_updated', fetchFailedJobs);
      socket.off('print_failure_alert', fetchFailedJobs);
      socket.off('invoice_print_completed', fetchFailedJobs);
      socket.off('kot_print_completed', fetchFailedJobs);
      socket.off('kot_print_failed', fetchFailedJobs);
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
