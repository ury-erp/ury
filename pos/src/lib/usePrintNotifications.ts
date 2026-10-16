import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { getRealtimeSocket } from './realtime';
import { showToast } from '@ury/ui';
import { useRootStore } from '../store/root-store';

export interface PrintJobStatusPayload {
  invoice: string;
  print_job_id: string;
  cups_job_id?: number;
  printer_name: string;
  status: 'QUEUED' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELED';
  reason?: string;
  job_owner?: string;
  table?: string;
}

export function usePrintNotifications(activeInvoiceName?: string) {
  const [activePrintJobs, setActivePrintJobs] = useState<Record<string, PrintJobStatusPayload>>({});

  useEffect(() => {
    let activeSocket: Socket | null = null;
    let cancelled = false;

    // 1. Status Update Listener (Fired on job status transition)
    const handleStatusUpdate = (data: PrintJobStatusPayload) => {
      setActivePrintJobs((prev) => ({
        ...prev,
        [data.print_job_id]: data,
      }));
    };

    // 2. Print Failure Alert Listener (Fired on CUPS failure or max retries)
    const handlePrintFailure = (data: {
      invoice?: string;
      print_job_id: string;
      printer_name?: string;
      reason?: string;
      job_type?: string;
      job_owner?: string;
      reference_doctype?: string;
      reference_name?: string;
    }) => {
      const currentUser = useRootStore.getState().user?.name;
      // Only alert when the failure is unowned or targeted at the current
      // user; drop alerts owned by someone else.
      if (
        data.job_owner &&
        currentUser &&
        data.job_owner.trim().toLowerCase() !== currentUser.trim().toLowerCase()
      ) {
        return;
      }

      const invoiceOrDoc = data.invoice || data.reference_name || data.print_job_id;
      const typeLabel = data.job_type === 'KOT' ? 'KOT' : 'Invoice';

      setActivePrintJobs((prev) => ({
        ...prev,
        [data.print_job_id]: {
          ...prev[data.print_job_id],
          invoice: invoiceOrDoc,
          print_job_id: data.print_job_id,
          printer_name: data.printer_name ?? '',
          status: 'FAILED',
          reason: data.reason,
          job_owner: data.job_owner,
        },
      }));

      if (!activeInvoiceName || data.invoice === activeInvoiceName || data.reference_name === activeInvoiceName || data.print_job_id === activeInvoiceName) {
        showToast.error(`${typeLabel} Printing Failed for ${invoiceOrDoc}: ${data.reason || 'Printer Error'}`, {
          autoClose: false,
          closeOnClick: true,
        });
      }
    };

    // 3. Print Completed Listener
    const handlePrintCompleted = (data: { invoice: string; print_job_id: string; printer_name: string }) => {
      setActivePrintJobs((prev) => ({
        ...prev,
        [data.print_job_id]: {
          ...prev[data.print_job_id],
          invoice: data.invoice,
          print_job_id: data.print_job_id,
          printer_name: data.printer_name,
          status: 'COMPLETED',
        },
      }));
    };

    getRealtimeSocket()
      .then((socket) => {
        if (cancelled) return;
        activeSocket = socket;

        socket.on('print_job_status_updated', handleStatusUpdate);
        socket.on('print_failure_alert', handlePrintFailure);
        socket.on('invoice_print_completed', handlePrintCompleted);
      })
      .catch((err) => {
        console.error('Failed to subscribe to print notifications:', err);
      });

    return () => {
      cancelled = true;
      if (!activeSocket) return;
      activeSocket.off('print_job_status_updated', handleStatusUpdate);
      activeSocket.off('print_failure_alert', handlePrintFailure);
      activeSocket.off('invoice_print_completed', handlePrintCompleted);
    };
  }, [activeInvoiceName]);

  return { activePrintJobs };
}
