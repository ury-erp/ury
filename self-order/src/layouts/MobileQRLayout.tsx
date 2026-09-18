import { useMemo, useState } from 'react'
import { formatCurrency } from '@ury/core'
import { useOrderingSession } from '../hooks/useOrderingSession'
import type { MenuItem, OrderingContext } from '../lib/api'
import { t, tPlural } from '../i18n'
import { LanguageToggle } from '../components/LanguageToggle'

interface LayoutProps {
  initialContext?: OrderingContext
}

const ALL_COURSES = '__all__'

/**
 * The surface a guest reaches by scanning the code on their table.
 *
 * Designed for one hand, at a table, on a phone the restaurant does not
 * control: every tap target clears 44px, the cart is a sheet rather than a
 * separate route (a guest who loses the menu to reach their cart stops
 * adding to it), and nothing depends on hover.
 */
function MobileQRLayout({ initialContext }: LayoutProps) {
  const {
    context,
    menu,
    order,
    cart,
    loading,
    submitting,
    error,
    billRequested,
    paymentRequest,
    payingOnline,
    addToCart,
    decrementCart,
    submitCart,
    handleRequestBill,
    payOnline,
    resetSession,
    cartItems,
    cartCount,
    cartTotal,
  } = useOrderingSession(initialContext)

  const [course, setCourse] = useState<string>(ALL_COURSES)
  const [query, setQuery] = useState('')
  const [cartOpen, setCartOpen] = useState(false)

  // Courses in menu order rather than alphabetical: a menu is sequenced by
  // the kitchen (starters before mains), and sorting destroys that intent.
  const courses = useMemo(() => {
    const seen = new Map<string, string>()
    menu.forEach((item) => {
      if (item.course && !seen.has(item.course)) {
        seen.set(item.course, item.course_label || item.course)
      }
    })
    return Array.from(seen, ([value, label]) => ({ value, label }))
  }, [menu])

  const visibleMenu = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return menu.filter((item) => {
      if (course !== ALL_COURSES && item.course !== course) return false
      if (!needle) return true
      return item.item_name.toLowerCase().includes(needle)
    })
  }, [menu, course, query])

  function handleStartOver() {
    if (window.confirm(t('order.confirm_start_over'))) {
      setCartOpen(false)
      resetSession()
    }
  }

  async function handleSubmit() {
    await submitCart()
    setCartOpen(false)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-muted border-t-primary"
          role="status"
          aria-label={t('order.loading_menu')}
        />
        <p className="text-sm text-muted-foreground">{t('order.loading_menu')}</p>
      </div>
    )
  }

  // A failure with no context means the link itself never resolved, so there
  // is nothing to render around the message — a full-page state, not a banner.
  if (error && !context) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-2xl">
          !
        </div>
        <h1 className="text-lg font-semibold">{t('errors.cannot_open_title')}</h1>
        <p className="text-sm text-muted-foreground">{error}</p>
        <p className="text-xs text-muted-foreground">{t('errors.cannot_open_hint')}</p>
      </div>
    )
  }

  // `source` (not the absence of a table) is the authoritative signal for
  // pickup mode — set server-side by _verify_qr_token/_resolve_device, never
  // guessed from context.table being falsy.
  const isPickup = context?.source === 'QR Pickup'
  const heading = isPickup
    ? t('order.for_pickup')
    : context?.table
      ? t('order.table', { table: context.table })
      : t('order.title')

  const hasOrder = !!order && order.items.length > 0

  return (
    <div className="min-h-screen bg-muted/30 pb-32">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {isPickup ? t('order.for_pickup') : t('order.title')}
            </p>
            <h1 className="truncate text-lg font-semibold leading-tight">{heading}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LanguageToggle />
            <button
              onClick={handleStartOver}
              className="rounded-full border px-3 py-1.5 text-xs font-medium text-muted-foreground transition active:scale-95"
            >
              {t('order.start_over')}
            </button>
          </div>
        </div>

        <div className="px-4 pb-3">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('menu.search_placeholder')}
            aria-label={t('menu.search_placeholder')}
            className="h-11 w-full rounded-xl border bg-background px-4 text-sm outline-none transition focus:border-primary"
          />
        </div>

        {courses.length > 0 && (
          <div className="flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <CourseChip
              label={t('menu.all_items')}
              active={course === ALL_COURSES}
              onClick={() => setCourse(ALL_COURSES)}
            />
            {courses.map((entry) => (
              <CourseChip
                key={entry.value}
                label={entry.label}
                active={course === entry.value}
                onClick={() => setCourse(entry.value)}
              />
            ))}
          </div>
        )}
      </header>

      {error && (
        <div
          role="alert"
          className="mx-4 mt-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {hasOrder && (
        <section className="mx-4 mt-4 overflow-hidden rounded-2xl border bg-background shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold">{t('order.so_far')}</h2>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {tPlural('order.item_count', order!.items.length)}
            </span>
          </div>

          {isPickup && order!.pickup_code && (
            <div className="border-b bg-muted/50 px-4 py-3 text-center">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t('order.pickup_code')}
              </p>
              <p className="text-xl font-bold tracking-widest tabular-nums">{order!.pickup_code}</p>
            </div>
          )}

          <ul className="divide-y">
            {order!.items.map((row, idx) => (
              <li key={`${row.item_code}-${idx}`} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="me-3 min-w-0 truncate">
                  <span className="text-muted-foreground tabular-nums">{row.qty}×</span> {row.item_name}
                </span>
                <span className="shrink-0 tabular-nums">{formatCurrency(row.amount)}</span>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between border-t px-4 py-3 text-base font-semibold">
            <span>{t('common.total')}</span>
            <span className="tabular-nums">{formatCurrency(order!.grand_total)}</span>
          </div>

          <div className="space-y-2 px-4 pb-4">
            {context?.capabilities.customer_payment_enabled && !order!.billed && (
              <button
                className="h-12 w-full rounded-xl bg-primary font-medium text-primary-foreground transition active:scale-[0.99] disabled:opacity-50"
                disabled={payingOnline}
                onClick={payOnline}
              >
                {payingOnline ? t('order.starting_payment') : t('order.pay_online')}
              </button>
            )}
            {paymentRequest && !paymentRequest.payment_url && (
              <p className="rounded-lg bg-muted p-2.5 text-xs text-muted-foreground">
                {t('order.payment_pending', {
                  amount: formatCurrency(paymentRequest.amount),
                })}
              </p>
            )}
            {!isPickup && context?.capabilities.request_bill_enabled && !order!.billed && (
              <button
                className="h-12 w-full rounded-xl border font-medium transition active:scale-[0.99] disabled:opacity-50"
                disabled={billRequested}
                onClick={handleRequestBill}
              >
                {billRequested ? t('order.bill_requested') : t('order.request_bill')}
              </button>
            )}
          </div>
        </section>
      )}

      <section className="mt-4 px-4">
        {visibleMenu.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-background/60 px-6 py-12 text-center">
            <p className="text-sm font-medium">{t('menu.no_results')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('menu.no_results_hint')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {visibleMenu.map((item) => (
              <MenuCard
                key={item.item}
                item={item}
                qty={cart[item.item]?.qty ?? 0}
                showImage={!!context?.capabilities.show_item_images}
                onAdd={() => addToCart(item)}
                onRemove={() => decrementCart(item.item)}
              />
            ))}
          </div>
        )}
      </section>

      {cartCount > 0 && (
        <>
          {cartOpen && (
            <button
              className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm"
              aria-label={t('order.close_cart')}
              onClick={() => setCartOpen(false)}
            />
          )}

          <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t bg-background shadow-[0_-8px_30px_rgba(0,0,0,0.12)]">
            {cartOpen && (
              <ul className="max-h-[45vh] divide-y overflow-y-auto px-4">
                {cartItems.map((entry) => (
                  <li key={entry.item.item} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{entry.item.item_name}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatCurrency(entry.item.rate * entry.qty)}
                      </p>
                    </div>
                    <QtyStepper
                      qty={entry.qty}
                      itemName={entry.item.item_name}
                      onAdd={() => addToCart(entry.item)}
                      onRemove={() => decrementCart(entry.item.item)}
                    />
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center gap-3 p-4">
              <button
                onClick={() => setCartOpen((open) => !open)}
                className="flex min-w-0 flex-1 items-center gap-2 text-start"
                aria-expanded={cartOpen}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground tabular-nums">
                  {cartCount}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs text-muted-foreground">
                    {cartOpen ? t('order.hide_cart') : t('order.view_cart')}
                  </span>
                  <span className="block truncate text-sm font-semibold tabular-nums">
                    {formatCurrency(cartTotal)}
                  </span>
                </span>
              </button>

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="h-12 shrink-0 rounded-xl bg-primary px-6 font-medium text-primary-foreground transition active:scale-[0.98] disabled:opacity-50"
              >
                {submitting ? t('order.placing') : t('order.place')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function CourseChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={[
        'shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition active:scale-95',
        active
          ? 'bg-primary text-primary-foreground'
          : 'border bg-background text-muted-foreground',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function MenuCard({
  item,
  qty,
  showImage,
  onAdd,
  onRemove,
}: {
  item: MenuItem
  qty: number
  showImage: boolean
  onAdd: () => void
  onRemove: () => void
}) {
  return (
    <div
      className={[
        'flex flex-col overflow-hidden rounded-2xl border bg-background transition',
        qty > 0 ? 'border-primary ring-1 ring-primary/30' : '',
      ].join(' ')}
    >
      {/* The whole upper area adds one — the most common action gets the
          largest target, and the stepper below handles the rest. */}
      <button onClick={onAdd} className="flex flex-1 flex-col text-start active:opacity-80">
        {showImage && (
          <div className="relative h-28 w-full bg-muted">
            {item.item_image ? (
              <img
                src={item.item_image}
                alt={item.item_name}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xl text-muted-foreground/50">
                {item.item_name.slice(0, 1)}
              </div>
            )}
            {!!item.special_dish && (
              <span className="absolute start-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                {t('menu.special')}
              </span>
            )}
          </div>
        )}
        <div className="flex flex-1 flex-col p-3">
          <p className="line-clamp-2 text-sm font-medium leading-snug">{item.item_name}</p>
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">
            {formatCurrency(item.rate)}
          </p>
        </div>
      </button>

      {qty > 0 && (
        <div className="border-t px-2 py-2">
          <QtyStepper qty={qty} itemName={item.item_name} onAdd={onAdd} onRemove={onRemove} />
        </div>
      )}
    </div>
  )
}

function QtyStepper({
  qty,
  itemName,
  onAdd,
  onRemove,
}: {
  qty: number
  itemName: string
  onAdd: () => void
  onRemove: () => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        onClick={onRemove}
        aria-label={t('order.remove_one', { item: itemName })}
        className="h-9 w-9 rounded-full border text-lg leading-none transition active:scale-90"
      >
        −
      </button>
      <span className="w-7 text-center text-sm font-semibold tabular-nums">{qty}</span>
      <button
        onClick={onAdd}
        aria-label={t('order.add_one', { item: itemName })}
        className="h-9 w-9 rounded-full border text-lg leading-none transition active:scale-90"
      >
        +
      </button>
    </div>
  )
}

export default MobileQRLayout
