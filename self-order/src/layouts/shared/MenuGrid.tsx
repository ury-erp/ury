import { useEffect, useState } from 'react'
import type { MenuItem } from '../../lib/api'
import { getAvailabilityMessage, getItemAvailability, ItemAvailability } from '../../lib/availability'
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
  /** Company for the V3-44 availability lookup — currently absent from
   * OrderingContext (see lib/availability.ts's "Known gap" note); when
   * unset, availability is not checked and every item renders as normal. */
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

  useEffect(() => {
    let cancelled = false
    if (!branch || !company) {
      setAvailability(null)
      return
    }
    getItemAvailability({ item_code: item.item, branch, company })
      .then((result) => {
        if (!cancelled) setAvailability(result)
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
