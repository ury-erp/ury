import { call } from '@ury/core'

export async function getCustomerFavouriteItems(customerName: string): Promise<unknown[]> {
  const res = await call.get('ury.ury.doctype.ury_order.ury_order.customer_favourite_item', {
    customer_name: customerName,
  })
  const message = res?.message ?? res
  return Array.isArray(message) ? message : []
}

export async function getOrderTypeOptions(): Promise<string[]> {
  try {
    const res = await call.get('ury.ury_pos.api.get_select_field_options')
    const message = res?.message ?? res
    if (Array.isArray(message)) return message.map(String)
    return []
  } catch {
    return []
  }
}
