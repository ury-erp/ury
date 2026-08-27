import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { db } from '@ury/core';
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
  failure_reason?: string;
  created_at?: string;
  retry_count?: number;
  cups_job_id?: number;
}

export interface InvoicePrintStatus {
  hasFailed: boolean;
  hasPending: boolean;
  jobsCount: number;
}

const POLL_INTERVAL_MS = 5000;
const FETCH_LIMIT = 100;

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELED']);

export function useOrdersPrintJobs() {
  const [jobs, setJobs] = useState<URYPrintJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialLoadRef = useRef(true);

  const fetchJobs = useCallback(async () => {
    if (initialLoadRef.current) {
      setLoading(true);
    }
    setError(null);

    try {
      const rows = await db.getDocList<URYPrintJob>('URY Print Job', {
        fields: [
          'name',
          'print_job_id',
          'job_type',
          'status',
          'invoice',
          'reference_name',
          'printer',
          'printer_name',
          'failure_reason',
          'created_at',
          'retry_count',
          'cups_job_id',
        ],
        limit: FETCH_LIMIT,
      } as unknown as Parameters<typeof db.getDocList>[1]);

      setJobs(rows);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch print jobs';
      setError(message);
    } finally {
      if (initialLoadRef.current) {
        initialLoadRef.current = false;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    const intervalId = setInterval(fetchJobs, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [fetchJobs]);

  useEffect(() => {
    const socket = getFrappeSocket();

    socket.on('print_job_status_updated', fetchJobs);
    socket.on('print_failure_alert', fetchJobs);
    socket.on('invoice_print_completed', fetchJobs);

    return () => {
      socket.off('print_job_status_updated', fetchJobs);
      socket.off('print_failure_alert', fetchJobs);
      socket.off('invoice_print_completed', fetchJobs);
    };
  }, [fetchJobs]);

  const getInvoicePrintStatus = useCallback(
    (invoiceId: string): InvoicePrintStatus => {
      const invoiceJobs = jobs.filter(
        (job) => job.invoice === invoiceId || job.reference_name === invoiceId
      );

      return {
        hasFailed: invoiceJobs.some((job) => job.status === 'FAILED'),
        hasPending: invoiceJobs.some((job) => !TERMINAL_STATUSES.has(job.status)),
        jobsCount: invoiceJobs.length,
      };
    },
    [jobs]
  );

  return useMemo(
    () => ({
      jobs,
      loading,
      error,
      refresh: fetchJobs,
      getInvoicePrintStatus,
    }),
    [jobs, loading, error, fetchJobs, getInvoicePrintStatus]
  );
}
