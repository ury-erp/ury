import { useEffect, useState } from 'react';
import { getFrappeSocket } from './socket';
import { showToast } from '@ury/ui';
import { usePOSStore } from '../store/pos-store';

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

    // 1. Status Update Listener (Fired every 3s polling cycle)
    const handleStatusUpdate = (data: PrintJobStatusPayload) => {
      setActivePrintJobs((prev) => {
        const prevJob = prev[data.print_job_id];
        // Only trigger info toast when transitioning into QUEUED, PENDING or PROCESSING for the first time
        if (!prevJob && (data.status === 'QUEUED' || data.status === 'PENDING' || data.status === 'PROCESSING')) {
          if (!activeInvoiceName || data.invoice === activeInvoiceName) {
            showToast.info(`Invoice ${data.invoice} printing submitted (${data.status})...`);
          }
        }
        return {
          ...prev,
          [data.print_job_id]: data,
        };
      });
    };

    // 2. Long Running Listener (Fired after 30 seconds observation)
    const handleLongRunning = (data: { invoice: string; print_job_id: string; printer_name: string }) => {
      if (!activeInvoiceName || data.invoice === activeInvoiceName) {
        showToast.info(`Invoice ${data.invoice} is still printing on ${data.printer_name}`);
      }
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
      const currentUser = usePOSStore.getState().user?.name;
      if (data.job_owner && currentUser && data.job_owner !== currentUser) {
        console.log('[usePrintNotifications] Dropped alert not targeted to current user', { target: data.job_owner, current: currentUser });
        return; // targeted to another user
      }

      const invoiceOrDoc = data.invoice || data.reference_name || data.print_job_id;

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
        showToast.error(`Printing Failed for ${invoiceOrDoc}: ${data.reason || 'Printer Error'}`);
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

      if (!activeInvoiceName || data.invoice === activeInvoiceName) {
        showToast.success(`Invoice ${data.invoice} printed successfully!`);
      }
    };

    // Register Frappe Realtime Sockets
    socket.on('print_job_status_updated', handleStatusUpdate);
    socket.on('invoice_print_long_running', handleLongRunning);
    socket.on('print_failure_alert', handlePrintFailure);
    socket.on('invoice_print_completed', handlePrintCompleted);

    return () => {
      socket.off('print_job_status_updated', handleStatusUpdate);
      socket.off('invoice_print_long_running', handleLongRunning);
      socket.off('print_failure_alert', handlePrintFailure);
      socket.off('invoice_print_completed', handlePrintCompleted);
    };
  }, [activeInvoiceName]);

  return { activePrintJobs };
}
