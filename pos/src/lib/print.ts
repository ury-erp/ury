import { printWithQz } from '@ury/core';
import {
  getInvoicePrintHtml,
  networkPrint,
  selectNetworkPrinter,
  updatePrintStatus
} from './invoice-api';
import { PosProfileCombined } from './pos-profile-api';

export interface PrintOrderResult {
  success: true;
  status: 'printed' | 'queued';
}

interface PrintOrderParams {
  orderId: string;
  posProfile: PosProfileCombined;
  printFormat?: string | null;
}

export async function printOrder({ orderId, posProfile, printFormat }: PrintOrderParams): Promise<PrintOrderResult> {
  const { print_type, qz_host, print_format, printer, name, cashier, multiple_cashier } = posProfile;
  const format = printFormat || print_format;

  // When offline, do not attempt a physical print. Queue the print-status update
  // so the local order transitions to Draft and the server is updated on reconnect.
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const { queued } = await updatePrintStatus(orderId);
    return { success: true, status: queued ? 'queued' : 'printed' };
  }

  try {
    if (print_type === 'qz') {
      if (!qz_host) {
        throw new Error('QZ host is not set');
      }
      const html = await getInvoicePrintHtml(orderId, format as string);
      await printWithQz(qz_host, html);
      const { queued } = await updatePrintStatus(orderId);
      return { success: true, status: queued ? 'queued' : 'printed' };
    } else if (print_type === 'network') {
      if (cashier && !multiple_cashier) {
        await networkPrint(orderId, printer as string, format as string);
      } else {
        await selectNetworkPrinter(orderId, name, format);
      }
      const { queued } = await updatePrintStatus(orderId);
      return { success: true, status: queued ? 'queued' : 'printed' };
    } else {
      // Redirect to printview page
      const url = `/printview?doctype=POS Invoice&name=${orderId}&format=${format}&no_letterhead=1&settings={}&letterhead=No Letterhead&trigger_print=1&_lang=en`;
      window.open(url, '_blank', 'noopener,noreferrer');
      const { queued } = await updatePrintStatus(orderId);
      return { success: true, status: queued ? 'queued' : 'printed' };
    }
  } catch (error) {
    // On any physical print failure or network error, fall back to the offline
    // queue path so the order still transitions to Draft locally and the print
    // status is replayed when connectivity returns.
    console.warn('[printOrder] Print failed or offline, queueing print update:', error);
    const { queued } = await updatePrintStatus(orderId);
    return { success: true, status: queued ? 'queued' : 'printed' };
  }
}