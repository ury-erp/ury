import { call } from '@ury/core'

export async function canCancelOrder(): Promise<boolean> {
  try {
    const res = await call.get('ury.ury.api.button_permission.cancel_check')
    const value = res?.message ?? res
    return Boolean(value)
  } catch {
    return false
  }
}

export async function cancelOrder(invoiceId: string, reason: string): Promise<void> {
  await call.post('ury.ury.doctype.ury_order.ury_order.cancel_order', {
    invoice_id: invoiceId,
    reason,
  })
}
