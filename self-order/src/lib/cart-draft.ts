import type { MenuItem } from './api'

export type Cart = Record<string, { item: MenuItem; qty: number; comment?: string }>
const DRAFT_KEY = 'ury_order_draft'
const MAX_AGE_MS = 30 * 60 * 1000

/** Persist selections only; current prices and availability always come from the menu. */
export function saveCartDraft(session: string, cart: Cart) {
  try {
    if (!Object.keys(cart).length) {
      sessionStorage.removeItem(DRAFT_KEY)
      return
    }
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
      session,
      updatedAt: Date.now(),
      items: Object.values(cart).map(({ item, qty, comment }) => ({ item: item.item, qty, comment })),
    }))
  } catch { /* Storage restrictions must not prevent ordering. */ }
}

export function clearCartDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY) } catch { /* Storage may be blocked. */ }
}

export function restoreCartDraft(session: string, menu: MenuItem[]): Cart {
  try {
    const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null')
    if (!draft || draft.session !== session || !Number.isFinite(draft.updatedAt)
      || Date.now() - draft.updatedAt > MAX_AGE_MS || !Array.isArray(draft.items)) return {}
    const available = new Map(menu.filter((item) => !item.disabled).map((item) => [item.item, item]))
    const cart: Cart = {}
    for (const row of draft.items) {
      const item = available.get(row?.item)
      if (item && Number.isSafeInteger(row.qty) && row.qty > 0) {
        cart[item.item] = { item, qty: row.qty, comment: typeof row.comment === 'string' ? row.comment.slice(0, 200) : undefined }
      }
    }
    return cart
  } catch { return {} }
}
