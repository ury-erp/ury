import { printWithQz } from '@ury/core'
import {
  assertNetworkPrintSuccess,
  getInvoicePrintHtml,
  networkPrint,
  printPosPage,
  selectNetworkPrinter,
  updatePrintStatus,
} from './invoice-api'
import { PosProfileCombined } from './pos-profile-api'

interface PrintOrderParams {
  orderId: string
  posProfile: PosProfileCombined
  printFormat?: string | null
}

export async function printOrder({
  orderId,
  posProfile,
  printFormat,
}: PrintOrderParams): Promise<'qz' | 'network' | 'socket'> {
  const { print_type, qz_host, print_format, printer, name, cashier, multiple_cashier } =
    posProfile
  const format = printFormat || print_format

  if (print_type === 'qz') {
    if (!qz_host) {
      throw new Error('QZ host is not set')
    }
    if (!format) {
      throw new Error('Print format is not set')
    }
    const html = await getInvoicePrintHtml(orderId, format as string)
    try {
      await printWithQz(qz_host, html)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/sign|init|uninitialized|private key|key/i.test(message)) {
        throw new Error(
          'QZ printing is not configured. Set VITE_QZ_SIGN_KEY or provide serve/privateKey.ts, then rebuild.'
        )
      }
      throw error
    }
    await updatePrintStatus(orderId)
    return 'qz'
  }

  if (print_type === 'network') {
    if (!format) {
      throw new Error('Print format is not set')
    }
    const result =
      cashier && !multiple_cashier
        ? await networkPrint(orderId, printer as string, format as string)
        : await selectNetworkPrinter(orderId, name, format)
    assertNetworkPrintSuccess(result)
    // network_printing / select_network_printer already set invoice_printed on Success
    return 'network'
  }

  // Socket / desk print station — realtime channel print_{branch}
  if (!format) {
    throw new Error('Print format is not set')
  }
  await printPosPage(orderId, format as string)
  return 'socket'
}
