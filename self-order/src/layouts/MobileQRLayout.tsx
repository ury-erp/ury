import { useMemo, useState } from 'react'
import { useIdleReset } from '../hooks/useIdleReset'
import { useOrderingSession } from '../hooks/useOrderingSession'
import type { OrderingContext } from '../lib/api'
import CategoryTabs from './shared/CategoryTabs'
import SearchBar from './shared/SearchBar'
import ProductCard from './shared/ProductCard'
import ProductDetail from './shared/ProductDetail'
import CartPage from './shared/CartPage'
import CheckoutScreen from './shared/CheckoutScreen'
import OrderStatusScreen from './shared/OrderStatusScreen'

interface LayoutProps {
  initialContext?: OrderingContext
}

function MobileQRLayout({ initialContext }: LayoutProps) {
  const {
    context,
    menu,
    order,
    orderStatus,
    cart,
    loading,
    submitting,
    error,
    billRequested,
    paymentRequest,
    payingOnline,
    screen,
    detailItemCode,
    addToCart,
    decrementCart,
    submitCart,
    handleRequestBill,
    payOnline,
    resetSession,
    cartItems,
    cartCount,
    cartTotal,
    goToMenu,
    goToDetail,
    goToCart,
    goToCheckout,
    goToStatus,
  } = useOrderingSession(initialContext)

  // Local state for category and search filters
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Extract unique categories from menu
  const categories = useMemo(() => {
    const seen = new Map<string, string>()
    for (const item of menu) {
      const key = item.course || 'Uncategorized'
      if (!seen.has(key)) {
        seen.set(key, item.course_label || item.course || 'Uncategorized')
      }
    }
    return Array.from(seen.entries()).map(([course, label]) => ({ course, course_label: label }))
  }, [menu])

  // Filter menu by category and search
  const filteredMenu = useMemo(() => {
    let filtered = menu
    if (selectedCategory !== null) {
      filtered = filtered.filter((item) => (item.course || 'Uncategorized') === selectedCategory)
    }
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase()
      filtered = filtered.filter((item) => item.item_name.toLowerCase().includes(lowerQuery))
    }
    return filtered
  }, [menu, selectedCategory, searchQuery])

  function handleStartOver() {
    if (window.confirm('Start over? Your current cart will be cleared.')) {
      resetSession()
    }
  }

  // Idle-reset: for a QR/link session (no device credential) resetSession
  // clears storage and falls back to the "missing ordering code" error,
  // requiring a fresh scan — resetSession already encodes that distinction,
  // so no separate device/QR branch is needed here.
  useIdleReset(resetSession, (context?.session_idle_timeout_minutes ?? 30) * 60000)

  // Handle product card click — check if detail is enabled
  function handleProductClick(itemCode: string) {
    if (context?.capabilities.product_detail_enabled) {
      goToDetail(itemCode)
    } else {
      // Add to cart directly if detail is disabled
      const item = menu.find((m) => m.item === itemCode)
      if (item) addToCart(item)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading menu…
      </div>
    )
  }

  if (error && !context) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center text-destructive">
        {error}
      </div>
    )
  }

  // `source` (not the absence of a table) is the authoritative signal for
  // pickup mode — set server-side by _verify_qr_token/_resolve_device, never
  // guessed from context.table being falsy.
  const isPickup = context?.source === 'QR Pickup'

  // Menu screen: header + category tabs + search bar + product grid
  if (screen === 'menu') {
    return (
      <div className="min-h-screen pb-28">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background/95 px-4 py-3 backdrop-blur">
          <h1 className="text-lg font-semibold">
            {isPickup ? 'Order for Pickup' : context?.table ? `Table ${context.table}` : 'Order'}
          </h1>
          <button
            onClick={handleStartOver}
            className="rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground"
          >
            Start Over
          </button>
        </header>

        {error && (
          <div className="mx-4 mt-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {order && order.items.length > 0 && (
          <section className="mx-4 mt-4 rounded-lg border p-3">
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">Your order so far</h2>
            {isPickup && order.pickup_code && (
              <p className="mb-2 rounded-md bg-muted p-2 text-center text-sm font-semibold">
                Pickup code: {order.pickup_code}
              </p>
            )}
            <ul className="space-y-1 text-sm">
              {order.items.map((row, idx) => (
                <li key={`${row.item_code}-${idx}`} className="flex justify-between">
                  <span>{row.item_name} × {row.qty}</span>
                  <span>{row.amount}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex justify-between border-t pt-2 text-sm font-semibold">
              <span>Total</span>
              <span>{order.grand_total}</span>
            </div>
          </section>
        )}

        <CategoryTabs
          categories={categories}
          activeCourse={selectedCategory}
          onSelect={setSelectedCategory}
        />

        <div className="mx-4 mt-4">
          <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Search menu..." />
        </div>

        <section className="mx-4 mt-4 grid grid-cols-2 gap-3">
          {filteredMenu.map((item) => (
            <div
              key={item.item}
              onClick={() => handleProductClick(item.item)}
              className="overflow-hidden rounded-lg border transition active:scale-[0.98]"
            >
              <ProductCard
                item={item}
                cartQty={cart[item.item]?.qty ?? 0}
                showImage={context?.capabilities.show_item_images ?? false}
                onClick={() => handleProductClick(item.item)}
                imageClassName="h-24 w-full object-cover"
                cardClassName="flex flex-col cursor-pointer"
              />
            </div>
          ))}
        </section>

        {cartCount > 0 && (
          <div className="fixed inset-x-0 bottom-0 border-t bg-background p-4">
            <button
              onClick={goToCart}
              className="w-full rounded-md bg-primary py-3 font-medium text-primary-foreground"
            >
              View Cart ({cartCount} item{cartCount > 1 ? 's' : ''}) • {cartTotal}
            </button>
          </div>
        )}
      </div>
    )
  }

  // Detail screen
  if (screen === 'detail' && detailItemCode) {
    const menuItem = menu.find((m) => m.item === detailItemCode)
    if (!menuItem) {
      return (
        <div className="flex h-screen items-center justify-center text-destructive">
          Item not found
        </div>
      )
    }
    return (
      <ProductDetail
        session={context!.session}
        itemCode={detailItemCode}
        menuItem={menuItem}
        onAddToCart={addToCart}
        onBack={goToMenu}
      />
    )
  }

  // Cart screen
  if (screen === 'cart') {
    return (
      <CartPage
        cartItems={cartItems}
        cartCount={cartCount}
        cartTotal={cartTotal}
        itemNotesEnabled={context?.capabilities.item_notes_enabled ?? false}
        onIncrement={addToCart}
        onDecrement={decrementCart}
        onBack={goToMenu}
        onCheckout={goToCheckout}
        className="flex h-screen flex-col"
      />
    )
  }

  // Checkout screen
  if (screen === 'checkout') {
    return (
      <div className="flex h-screen flex-col overflow-y-auto">
        <header className="flex items-center gap-2 border-b p-4">
          <button
            onClick={goToCart}
            className="rounded-md border px-3 py-2 text-sm font-medium"
            aria-label="Back to cart"
          >
            ← Back to cart
          </button>
          <h1 className="flex-1 text-center text-lg font-semibold">Checkout</h1>
          <span className="w-[92px]" aria-hidden="true" />
        </header>
        <div className="flex-1 overflow-y-auto pb-4">
          <CheckoutScreen
            capabilities={{
              customer_payment_enabled: context?.capabilities.customer_payment_enabled ?? false,
              pay_at_counter_enabled: context?.capabilities.pay_at_counter_enabled ?? false,
              request_bill_enabled: context?.capabilities.request_bill_enabled ?? false,
            }}
            cartItems={cartItems}
            cartCount={cartCount}
            cartTotal={cartTotal}
            submitting={submitting}
            payingOnline={payingOnline}
            billRequested={billRequested}
            paymentRequest={paymentRequest}
            onSubmitCart={() => {
              submitCart().then((success) => {
                if (success) goToStatus()
              })
            }}
            onPayOnline={payOnline}
            onRequestBill={handleRequestBill}
          />
        </div>
      </div>
    )
  }

  // Status screen
  if (screen === 'status') {
    const canAddMore = context?.capabilities.add_to_running_table_enabled ?? false
    return (
      <OrderStatusScreen
        status={orderStatus}
        isPickup={isPickup}
        pickupCode={isPickup ? order?.pickup_code : undefined}
        canAddMore={canAddMore && !isPickup}
        onAddMore={() => {
          goToMenu()
          setSelectedCategory(null)
          setSearchQuery('')
        }}
        onDone={resetSession}
      />
    )
  }

  return null
}

export default MobileQRLayout
