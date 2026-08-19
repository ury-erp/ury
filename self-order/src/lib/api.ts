import { call } from '@ury/core'

const M = 'ury.ury.api.self_ordering'

export interface OrderingCapabilities {
  product_detail_enabled: boolean
  show_item_images: boolean
  show_item_descriptions: boolean
  item_notes_enabled: boolean
  request_bill_enabled: boolean
  customer_payment_enabled: boolean
  payment_link_enabled: boolean
  pay_at_counter_enabled: boolean
  add_to_running_table_enabled: boolean
}

export interface OrderingContext {
  session: string
  source: string
  restaurant: string
  table: string | null
  capabilities: OrderingCapabilities
}

export interface MenuItem {
  item: string
  item_name: string
  rate: number
  special_dish: number
  disabled: number
  item_image: string | null
  course: string | null
  course_label: string | null
}

export interface MenuResponse {
  items: MenuItem[]
  modified_time: string | null
  name: string | null
}

export interface OrderItem {
  item_code: string
  item_name: string
  qty: number
  comment: string | null
  rate: number
  amount: number
}

export interface CustomerOrder {
  invoice: string | null
  table?: string | null
  order_type?: string
  items: OrderItem[]
  grand_total: number
  billed: boolean
}

export interface OrderStatus {
  session_status: string
  invoice: string | null
  billed?: boolean
  submitted?: boolean
  open_requests?: { name: string; request_type: string; status: string }[]
}

// Persist the opaque, single-use-per-scan session token across the mobile
// browser session — a page refresh must not force a customer to rescan.
const SESSION_KEY = 'ury_order_session'

export function getStoredSession(): string | null {
  return sessionStorage.getItem(SESSION_KEY)
}

function storeSession(token: string) {
  sessionStorage.setItem(SESSION_KEY, token)
}

export async function bootstrap(token: string): Promise<OrderingContext> {
  const context = await call.get<OrderingContext>(`${M}.get_ordering_context`, { token })
  storeSession(context.session)
  return context
}

export async function getMenu(session: string): Promise<MenuResponse> {
  return call.get<MenuResponse>(`${M}.get_customer_menu`, { session })
}

export async function getCurrentOrder(session: string): Promise<CustomerOrder> {
  return call.get<CustomerOrder>(`${M}.get_customer_order`, { session })
}

export async function addItems(
  session: string,
  items: { item: string; qty: number; comment?: string }[],
): Promise<CustomerOrder> {
  return call.post<CustomerOrder>(`${M}.add_customer_items`, { session, items: JSON.stringify(items) })
}

export async function requestBill(session: string): Promise<{ status: string; request: string }> {
  return call.post(`${M}.request_bill`, { session })
}

export async function getStatus(session: string): Promise<OrderStatus> {
  return call.get<OrderStatus>(`${M}.get_order_status`, { session })
}
