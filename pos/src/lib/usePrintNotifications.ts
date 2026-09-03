import { useEffect, useState } from 'react';
import { getFrappeSocket } from './socket';
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
    const socket = getFrappeSocket();

    // 1. Status Update Listener (Fired on job status transition)
    const handleStatusUpdate = (data: PrintJobStatusPayload) => {
      setActivePrintJobs((prev) => ({
        ...prev,
        [data.print_job_id]: data,
      }));
    };

    // 2. Long Running Listener (Fired after observation)
    const handleLongRunning = (_data: { invoice: string; print_job_id: string; printer_name: string }) => {
      // Long-running info toast removed per UX spec (preserve only failure alerts)
    };

    // 3. Print Failure Alert Listener (Fired on CUPS failure or max retries)
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
      console.log('[usePrintNotifications] Received print_failure_alert:', data);
      const currentUser = useRootStore.getState().user?.name;
      if (
        data.job_owner &&
        currentUser &&
        data.job_owner.trim().toLowerCase() !== currentUser.trim().toLowerCase()
      ) {
        console.log('[usePrintNotifications] Dropped alert not targeted to current user', {
          target: data.job_owner,
          current: currentUser,
        });
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
          printer_name: data.printer_name,
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

    // 4. Print Completed Listener
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

    // 5. KOT Print Completed Listener
    const handleKotCompleted = (data: { kot: string; invoice?: string; print_job_id: string; production?: string }) => {
      setActivePrintJobs((prev) => ({
        ...prev,
        [data.print_job_id]: {
          ...prev[data.print_job_id],
          invoice: data.invoice || data.kot,
          print_job_id: data.print_job_id,
          status: 'COMPLETED',
        },
      }));
    };

    // Register Frappe Realtime Sockets
    socket.on('print_job_status_updated', handleStatusUpdate);
    socket.on('invoice_print_long_running', handleLongRunning);
    socket.on('print_failure_alert', handlePrintFailure);
    socket.on('invoice_print_completed', handlePrintCompleted);
    socket.on('kot_print_completed', handleKotCompleted);

    return () => {
      socket.off('print_job_status_updated', handleStatusUpdate);
      socket.off('invoice_print_long_running', handleLongRunning);
      socket.off('print_failure_alert', handlePrintFailure);
      socket.off('invoice_print_completed', handlePrintCompleted);
      socket.off('kot_print_completed', handleKotCompleted);
    };
  }, [activeInvoiceName]);

  return { activePrintJobs };
}
