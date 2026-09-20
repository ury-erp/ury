import React from 'react'
import { formatCurrency } from '@ury/core'
import type { BillStatus, CustomerOrder, KitchenStatus, MenuItem, OrderingContext, WaiterStatus } from '../../lib/api'
import { AnimatedNumber, EmptyState } from '@ury/ui'
import { Minus, Plus, ShoppingBasket } from 'lucide-react'
import { t, tPlural } from '../../i18n'
import BillStatusNotice from './BillStatusNotice'
import CallWaiterButton from './CallWaiterButton'
import KitchenStatusStrip from './KitchenStatusStrip'

type CartEntry = { item: MenuItem; qty: number }

interface CartPanelProps {
  context: OrderingContext | null
  order: CustomerOrder | null
  cartItems: CartEntry[]
  cartCount: number
  cartTotal: number
  submitting: boolean
  billRequested: boolean
  billStatus: BillStatus | null
  waiterStatus: WaiterStatus | null
  kitchenStatus: KitchenStatus | null
  onCallWaiter: () => void
  payingOnline: boolean
  onIncrement: (item: MenuItem) => void
  onDecrement: (itemCode: string) => void
  onSubmit: () => void
  onRequestBill: () => void
  onPayOnline: () => void
  className?: string
}

/**
 * Persistent order-summary + cart panel shared between TabletLayout and
 * LandscapeKioskLayout. Unlike MobileQRLayout's bottom sheet, this is always
 * visible — no toggle to open/close it.
 */
function CartPanel({
  context,
  order,
  cartItems,
  cartCount,
  cartTotal,
  submitting,
  billRequested,
  billStatus,
  waiterStatus,
  kitchenStatus,
  onCallWaiter,
  payingOnline,
  onIncrement,
  onDecrement,
  onSubmit,
  onRequestBill,
  onPayOnline,
  className,
}: CartPanelProps) {
  return (
    <aside className={className}>
      <div className="flex-1 overflow-y-auto">
        {order && order.items.length > 0 && (
          <div className="mb-4">
            <KitchenStatusStrip status={kitchenStatus} />
          </div>
        )}
        {order && order.items.length > 0 && (
          <section className="mb-4 rounded-lg border p-3">
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">{t('order.so_far')}</h2>
            <ul className="space-y-1 text-sm">
              {order.items.map((row, idx) => (
                <li key={`${row.item_code}-${idx}`} className="flex justify-between">
                  <span>
                    {row.item_name} × {row.qty}
                  </span>
                  <span>{formatCurrency(row.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex justify-between border-t pt-2 text-sm font-semibold">
              <span>{t('common.total')}</span>
              <span>{formatCurrency(order.grand_total)}</span>
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">{t('order.cart')}</h2>
          {cartItems.length === 0 ? (
            <EmptyState
              size="sm"
              icon={<ShoppingBasket />}
              title={t('order.cart')}
              description={t('order.empty_hint')}
            />
          ) : (
            <ul className="space-y-2 text-sm">
              {cartItems.map((entry, index) => (
                <li
                  key={entry.item.item}
                  style={{ '--i': index } as React.CSSProperties}
                  className="flex items-center justify-between gap-2 animate-slide-in stagger-fast"
                >
                  <span className="flex-1">{entry.item.item_name}</span>
                  <span className="flex items-center gap-2">
                    <button
                      onClick={() => onDecrement(entry.item.item)}
                      className="flex h-12 w-12 items-center justify-center rounded-full border bg-card press transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={t('order.remove_one', { item: entry.item.item_name })}
                    >
                      <Minus className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <span className="w-6 text-center font-semibold tabular-nums">{entry.qty}</span>
                    <button
                      onClick={() => onIncrement(entry.item)}
                      className="flex h-12 w-12 items-center justify-center rounded-full border bg-card press transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={t('order.add_one', { item: entry.item.item_name })}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="border-t pt-3">
        <div className="mb-3 flex items-center justify-between text-sm font-semibold">
          <span>{tPlural('order.item_count', cartCount)}</span>
          <AnimatedNumber value={formatCurrency(cartTotal)} className="text-base font-bold" />
        </div>
        <button
          onClick={onSubmit}
          disabled={submitting || cartCount === 0}
          className="w-full rounded-md bg-primary py-3 font-medium text-primary-foreground disabled:opacity-50"
        >
          {submitting ? t('order.placing') : t('order.place')}
        </button>
        {context?.capabilities.customer_payment_enabled && order && !order.billed && (
          <button
            className="mt-2 w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            disabled={payingOnline}
            onClick={onPayOnline}
          >
            {payingOnline ? t('order.starting_payment') : t('order.pay_online')}
          </button>
        )}
        {context?.capabilities.request_bill_enabled && order && !order.billed && (
          <button
            className="mt-2 w-full rounded-md border py-2 text-sm font-medium disabled:opacity-50"
            disabled={billRequested}
            onClick={onRequestBill}
          >
            {billRequested ? t('order.bill_requested') : t('order.request_bill')}
          </button>
        )}
        <BillStatusNotice status={billStatus} />
        <CallWaiterButton
          context={context}
          status={waiterStatus}
          onCall={onCallWaiter}
          className="mt-2"
        />
      </div>
    </aside>
  )
}

export default CartPanel
