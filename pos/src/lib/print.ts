import { printWithQz } from '@ury/core';
import {
  getInvoicePrintHtml,
  networkPrint,
  selectNetworkPrinter,
  updatePrintStatus
} from './invoice-api';
import { PosProfileCombined } from './pos-profile-api';

interface PrintOrderParams {
  orderId: string;
  posProfile: PosProfileCombined;
  printFormat?: string | null;
}

export async function printOrder({ orderId, posProfile, printFormat }: PrintOrderParams): Promise<'qz' | 'network' | 'socket'> {
  const { print_type, qz_host, print_format, printer, name, cashier, multiple_cashier } = posProfile;
  const format = printFormat || print_format;

  if (print_type === 'qz') {
    if (!qz_host) {
      throw new Error('QZ host is not set');
    }
    const html = await getInvoicePrintHtml(orderId, format as string);
    await printWithQz(qz_host, html);
    await updatePrintStatus(orderId);
    return 'qz';
  } else if (print_type === 'network') {
    let result: { status: 'Success' | 'Failure'; message?: string };
    if (cashier && !multiple_cashier) {
      result = await networkPrint(orderId, printer as string, format as string);
    } else {
      result = await selectNetworkPrinter(orderId, name, format);
    }
    // Network printing lifecycle is driven asynchronously by CUPS state polling
    // and backend finalization; do NOT call updatePrintStatus here.
    if (result.status === 'Failure') {
      throw new Error(result.message || 'Network print submission failed');
    }
    return 'network';
  } else {
    // Redirect to printview page
    const url = `/printview?doctype=POS Invoice&name=${orderId}&format=${format}&no_letterhead=1&settings={}&letterhead=No Letterhead&trigger_print=1&_lang=en`;
    window.open(url, '_blank', 'noopener,noreferrer');
    await updatePrintStatus(orderId);
    return 'socket';
  }
}