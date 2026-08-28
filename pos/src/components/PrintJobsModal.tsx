import { useMemo, useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { call } from '@ury/core';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  showToast,
  Spinner,
} from '@ury/ui';
import type { URYPrintJob } from '../hooks/useOrdersPrintJobs';

interface PrintJobsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string | null;
  jobs: URYPrintJob[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

function getStatusBadgeVariant(status: string) {
  switch (status) {
    case 'COMPLETED':
      return 'success' as const;
    case 'FAILED':
      return 'danger' as const;
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
  jobs,
  loading,
  error,
  onRefresh,
}: PrintJobsModalProps) {
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

  const invoiceJobs = useMemo(() => {
    if (!invoiceId) return [];
    return jobs.filter(
      (job) => job.invoice === invoiceId || job.reference_name === invoiceId
    );
  }, [jobs, invoiceId]);

  const handleRetry = useCallback(
    async (jobId: string) => {
      setRetryingIds((prev) => new Set(prev).add(jobId));
      try {
        await call.post('ury.ury.printing.api.retry_print_job', {
          print_job_id: jobId,
        });
        showToast.success('Print job retry submitted');
        onRefresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Retry failed';
        showToast.error(message);
      } finally {
        setRetryingIds((prev) => {
          const next = new Set(prev);
          next.delete(jobId);
          return next;
        });
      }
    },
    [onRefresh]
  );

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
                const isRetrying = retryingIds.has(job.print_job_id);
                return (
                  <li
                    key={job.print_job_id}
                    className="rounded-lg border border-gray-200 bg-gray-50/80 p-3.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-gray-900 text-sm leading-tight">
                        {job.job_type || 'BILL'}
                      </h3>
                      <Badge variant={getStatusBadgeVariant(job.status)}>
                        {job.status}
                      </Badge>
                    </div>

                    <div className="mt-1 text-xs text-gray-600">
                      {job.printer_name || job.printer || 'Unknown printer'}
                    </div>

                    <div className="mt-1 text-xs text-gray-500">
                      {formatJobTime(job.created_at)}
                    </div>


                    {job.status === 'FAILED' && (
                      <div className="mt-3">
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => handleRetry(job.print_job_id)}
                          disabled={isRetrying}
                        >
                          <RefreshCw
                            className={`mr-1.5 h-3.5 w-3.5 ${
                              isRetrying ? 'animate-spin' : ''
                            }`}
                          />
                          {isRetrying ? 'Retrying...' : 'Retry Print'}
                        </Button>
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
