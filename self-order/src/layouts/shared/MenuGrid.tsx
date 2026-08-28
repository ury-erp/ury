import { useEffect, useState } from 'react'
import type { MenuItem, OrderingCapabilities } from '../../lib/api'
import { getAvailabilityMessage, getItemAvailability, ItemAvailability } from '../../lib/availability'

type Cart = Record<string, { item: MenuItem; qty: number }>

interface MenuGridProps {
  menu: MenuItem[]
  cart: Cart
  capabilities: OrderingCapabilities | undefined
  onAdd: (item: MenuItem) => void
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
 * Category-free scrollable grid of menu items. Shared visual language
 * between TabletLayout and LandscapeKioskLayout — only the sizing classes
 * differ (larger cards, more columns on the kiosk).
 */
function MenuGrid({
  menu,
  cart,
  capabilities,
  onAdd,
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
          cartQty={cart[item.item]?.qty}
          showImage={!!capabilities?.show_item_images}
          onAdd={onAdd}
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
  cartQty: number | undefined
  showImage: boolean
  onAdd: (item: MenuItem) => void
  cardClassName: string
  imageClassName?: string
  branch?: string
  company?: string
}

function MenuGridCard({ item, cartQty, showImage, onAdd, cardClassName, imageClassName, branch, company }: MenuGridCardProps) {
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
    <button
      onClick={() => (isUnavailable ? undefined : onAdd(item))}
      disabled={isUnavailable}
      aria-disabled={isUnavailable || undefined}
      className={`${cardClassName} ${isUnavailable ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {showImage && item.item_image && (
        <img src={item.item_image} alt={item.item_name} className={imageClassName ?? 'w-full object-cover'} />
      )}
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="font-medium">{item.item_name}</div>
        <div className="text-muted-foreground">{item.rate}</div>
        {unavailableMessage ? (
          <div className="mt-1 text-sm font-semibold text-destructive">{unavailableMessage}</div>
        ) : (
          cartQty && <div className="mt-1 text-sm font-semibold text-primary">In cart: {cartQty}</div>
        )}
      </div>
    </button>
  )
}

export default MenuGrid
