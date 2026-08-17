import { useEffect, useState } from 'react';
import { getFrappeSocket } from './socket';
import { showToast } from '@ury/ui';

export interface PrintJobStatusPayload {
  invoice: string;
  print_job_id: string;
  cups_job_id?: number;
  printer_name: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELED';
  reason?: string;
}

export function usePrintNotifications(activeInvoiceName?: string) {
  const [activePrintJobs, setActivePrintJobs] = useState<Record<string, PrintJobStatusPayload>>({});

  useEffect(() => {
    const socket = getFrappeSocket();

    // 1. Status Update Listener (Fired every 3s polling cycle)
    const handleStatusUpdate = (data: PrintJobStatusPayload) => {
      setActivePrintJobs((prev) => ({
        ...prev,
        [data.print_job_id]: data,
      }));

      if (!activeInvoiceName || data.invoice === activeInvoiceName) {
        if (data.status === 'PENDING' || data.status === 'PROCESSING') {
          showToast.info(`Invoice ${data.invoice} is printing... (${data.status})`);
        } else if (data.status === 'COMPLETED') {
          showToast.success(`Invoice ${data.invoice} printed successfully!`);
        }
      }
    };

    // 2. Long Running Listener (Fired after 30 seconds observation)
    const handleLongRunning = (data: { invoice: string; print_job_id: string; printer_name: string }) => {
      if (!activeInvoiceName || data.invoice === activeInvoiceName) {
        showToast.info(`Invoice ${data.invoice} is still printing on ${data.printer_name}`);
      }
    };

    // 3. Print Failure Alert Listener (Fired on CUPS failure or max retries)
    const handlePrintFailure = (data: { invoice: string; print_job_id: string; printer_name: string; reason: string }) => {
      setActivePrintJobs((prev) => ({
        ...prev,
        [data.print_job_id]: {
          ...prev[data.print_job_id],
          invoice: data.invoice,
          print_job_id: data.print_job_id,
          printer_name: data.printer_name,
          status: 'FAILED',
          reason: data.reason,
        },
      }));

      showToast.error(`Printing Failed for ${data.invoice}: ${data.reason || 'Printer Error'}`);
    };

    // 4. Print Completed Listener
    const handlePrintCompleted = (data: { invoice: string; print_job_id: string; printer_name: string }) => {
      showToast.success(`Invoice ${data.invoice} printed successfully!`);
    };

    // Register Frappe Realtime Sockets
    socket.on('print_job_status_updated', handleStatusUpdate);
    socket.on('invoice_print_long_running', handleLongRunning);
    socket.on('print_failure_alert', handlePrintFailure);
    socket.on('invoice_print_failed', handlePrintFailure);
    socket.on('invoice_print_completed', handlePrintCompleted);

    return () => {
      socket.off('print_job_status_updated', handleStatusUpdate);
      socket.off('invoice_print_long_running', handleLongRunning);
      socket.off('print_failure_alert', handlePrintFailure);
      socket.off("invoice_print_failed", handlePrintFailure);
      socket.off('invoice_print_completed', handlePrintCompleted);
    };
  }, [activeInvoiceName]);

  return { activePrintJobs };
}
