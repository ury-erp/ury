import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Badge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Spinner,
} from '@ury/ui';
import type { URYPrintJob } from '../hooks/useOrdersPrintJobs';

interface PrintJobsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string | null;
}

function getStatusBadgeVariant(status: string) {
  switch (status) {
    case 'COMPLETED':
      return 'success' as const;
    case 'FAILED':
      return 'danger' as const;
    case 'QUEUED':
    case 'PENDING':
    case 'PROCESSING':
      return 'warning' as const;
    default:
      return 'secondary' as const;
  }
}

function formatJobTime(timestamp?: string) {
  if (!timestamp) return '--';
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return timestamp;
  }
}

export function PrintJobsModal({
  open,
  onOpenChange,
  invoiceId,
}: PrintJobsModalProps) {
  const [jobs, setJobs] = useState<URYPrintJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInvoiceJobs = useCallback(async () => {
    if (!invoiceId) {
      setJobs([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        fields: JSON.stringify([
          'name',
          'print_job_id',
          'job_type',
          'status',
          'invoice',
          'reference_name',
          'printer',
          'printer_name',
          'job_owner',
          'table',
          'failure_reason',
          'created_at',
          'retry_count',
          'cups_job_id',
        ]),
        filters: JSON.stringify([['invoice', '=', invoiceId]]),
      });

      const res = await fetch(`/api/resource/URY%20Print%20Job?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch print jobs: ${res.statusText}`);
      }
      const data = await res.json();
      const rows: URYPrintJob[] = data?.data || [];

      setJobs(rows);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch print jobs';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    if (open && invoiceId) {
      fetchInvoiceJobs();
    }
    if (!open) {
      setJobs([]);
      setError(null);
    }
  }, [open, invoiceId, fetchInvoiceJobs]);

  const invoiceJobs = useMemo(() => {
    if (!invoiceId) return [];
    return jobs.filter(
      (job) => job.invoice === invoiceId || job.reference_name === invoiceId
    );
  }, [jobs, invoiceId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="large"
        className="flex max-h-[80vh] flex-col bg-white p-0"
        onClose={() => onOpenChange(false)}
      >
        <DialogHeader className="border-b border-gray-200 p-4">
          <DialogTitle className="text-xl font-semibold text-gray-900">
            Print Jobs
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500">
            {invoiceId ? `Print queue for invoice ${invoiceId}` : 'View print jobs for the selected invoice'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && invoiceJobs.length === 0 && (
            <div className="py-8 text-center">
              <Spinner message="Loading print jobs..." />
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && invoiceJobs.length === 0 && (
            <div className="py-8 text-center text-gray-600">
              No print jobs found for this invoice.
            </div>
          )}

          {invoiceJobs.length > 0 && (
            <ul className="space-y-3">
              {invoiceJobs.map((job) => {
                const jobName = job.print_job_id || job.name;
                return (
                  <li
                    key={jobName}
                    className="rounded-lg border border-gray-200 bg-gray-50/80 p-3.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-baseline gap-2 min-w-0">
                        <h3 className="font-semibold text-gray-900 text-sm leading-tight">
                          {job.job_type || 'BILL'}
                        </h3>
                        <span
                          className="text-xs font-mono text-gray-500 truncate"
                          title={jobName}
                        >
                          {jobName}
                        </span>
                      </div>
                      <Badge variant={getStatusBadgeVariant(job.status)}>
                        {job.status}
                      </Badge>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
                      <span>{job.printer_name || job.printer || 'Unknown printer'}</span>
                      <span className="text-gray-300">•</span>
                      <span className="text-gray-500">{formatJobTime(job.created_at)}</span>
                      <span className="text-gray-300">•</span>
                      <span>Job Owner: {job.job_owner || '--'}</span>
                      {job.table && (
                        <>
                          <span className="text-gray-300">•</span>
                          <span>Table: {job.table}</span>
                        </>
                      )}
                    </div>

                    {job.status === 'FAILED' && job.failure_reason && (
                      <div className="mt-1.5 text-xs text-red-600">
                        {job.failure_reason}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PrintJobsModal;
