import { useCallback, useEffect, useRef, useState } from 'react'
import type { MenuItem } from '../../lib/api'
import { getAvailabilityMessage, getItemAvailability, ItemAvailability } from '../../lib/availability'
import { useMenuAvailabilityChannel } from '../../lib/realtime'
import ProductCard from './ProductCard'

type Cart = Record<string, { item: MenuItem; qty: number }>

interface MenuGridProps {
  menu: MenuItem[]
  cart: Cart
  showImage: boolean
  /** Called when a card is tapped and it is available. Callers decide
   * whether that means "add directly to cart" or "open product detail" —
   * see each layout's handleProductClick/handleProductTap. */
  onItemClick: (item: MenuItem) => void
  /** Tailwind grid classes (columns/gap) — differs between Tablet and Kiosk. */
  gridClassName: string
  /** Tailwind classes for each card — controls touch-target size. */
  cardClassName: string
  imageClassName?: string
  /** Branch (restaurant) for the V3-44 availability lookup; omit to skip the check entirely. */
  branch?: string
  /** Company for the V3-44 availability lookup (from OrderingContext.company);
   * when unset, availability is not checked and every item renders as normal. */
  company?: string
}

/**
 * Category-free scrollable grid of menu items, shared between TabletLayout
 * and LandscapeKioskLayout. Renders each item via the shared `ProductCard`
 * (same visual language as the rest of the #288 UI overhaul) but wraps it
 * with a per-item availability check (V3-44 material/production-plan stock
 * gating) that dims and disables out-of-stock items before ProductCard ever
 * sees the click.
 */
function MenuGrid({
  menu,
  cart,
  showImage,
  onItemClick,
  gridClassName,
  cardClassName,
  imageClassName,
  branch,
  company,
}: MenuGridProps) {
  return (
    <div className={gridClassName}>
      {menu.map((item) => (
        <MenuGridCard
          key={item.item}
          item={item}
          cartQty={cart[item.item]?.qty ?? 0}
          showImage={showImage}
          onClick={onItemClick}
          cardClassName={cardClassName}
          imageClassName={imageClassName}
          branch={branch}
          company={company}
        />
      ))}
    </div>
  )
}

interface MenuGridCardProps {
  item: MenuItem
  cartQty: number
  showImage: boolean
  onClick: (item: MenuItem) => void
  cardClassName: string
  imageClassName?: string
  branch?: string
  company?: string
}

function MenuGridCard({ item, cartQty, showImage, onClick, cardClassName, imageClassName, branch, company }: MenuGridCardProps) {
  const [availability, setAvailability] = useState<ItemAvailability | null>(null)
  // Timestamp (ms) of the last successful availability refresh, from any
  // source (mount fetch, I1 realtime event, or an I2 poll tick). The I2
  // poll below reads this to decide whether a tick is redundant.
  const lastRefreshedAtRef = useRef<number>(0)

  useEffect(() => {
    let cancelled = false
    if (!branch || !company) {
      setAvailability(null)
      return
    }
    getItemAvailability({ item_code: item.item, branch, company })
      .then((result) => {
        if (!cancelled) {
          setAvailability(result)
          lastRefreshedAtRef.current = Date.now()
        }
      })
      .catch(() => {
        // Display-only lookup — a failed check must never block the menu
        // from rendering. Treat as "unknown" (no gating) on error.
        if (!cancelled) setAvailability(null)
      })
    return () => {
      cancelled = true
    }
  }, [item.item, branch, company])

  // I1: on a live "menu_availability_update_<branch>" event that names this
  // item, re-check just this item's availability (skipCache: true) and
  // update local state — mirrors the frontend Pos app's MenuCard.tsx.
  const refetchAvailability = useCallback(() => {
    if (!branch || !company) return
    getItemAvailability({ item_code: item.item, branch, company }, { skipCache: true })
      .then((result) => {
        setAvailability(result)
        lastRefreshedAtRef.current = Date.now()
      })
      .catch(() => {
        // Same soft-fail contract as the mount-time fetch above.
      })
  }, [item.item, branch, company])

  useMenuAvailabilityChannel(branch, (payload) => {
    if (payload.affected_items?.includes(item.item)) {
      refetchAvailability()
    }
  })

  // I2: TTL fallback poll — independent of I1's realtime subscription ever
  // connecting. Ticks every POLL_INTERVAL_MS; on each tick it only
  // re-fetches if at least POLL_INTERVAL_MS has elapsed since the last
  // successful refresh (mount, an I1 event, or a previous poll tick), so a
  // recent realtime-driven refresh resets the poll clock and this doesn't
  // fight I1's traffic when realtime is healthy. This effect does not read
  // or depend on any state from useMenuAvailabilityChannel — it works
  // unchanged even if that hook/subscription were deleted entirely.
  useEffect(() => {
    if (!branch || !company) return
    const POLL_INTERVAL_MS = 45_000
    const intervalId = setInterval(() => {
      const elapsed = Date.now() - lastRefreshedAtRef.current
      if (elapsed < POLL_INTERVAL_MS) return
      getItemAvailability({ item_code: item.item, branch, company }, { skipCache: true })
        .then((result) => {
          setAvailability(result)
          lastRefreshedAtRef.current = Date.now()
        })
        .catch(() => {
          // Same soft-fail contract as the other fetches above.
        })
    }, POLL_INTERVAL_MS)
    return () => clearInterval(intervalId)
  }, [item.item, branch, company])

  const isUnavailable = !!availability && (!availability.sellable || availability.available_qty <= 0)
  const unavailableMessage = isUnavailable ? getAvailabilityMessage(availability?.reason_code) : null

  return (
    <ProductCard
      item={item}
      cartQty={cartQty}
      showImage={showImage}
      onClick={() => onClick(item)}
      cardClassName={cardClassName}
      imageClassName={imageClassName}
      disabled={isUnavailable}
      unavailableMessage={unavailableMessage}
    />
  )
}

export default MenuGrid
