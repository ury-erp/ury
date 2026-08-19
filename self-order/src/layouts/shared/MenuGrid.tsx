import type { MenuItem, OrderingCapabilities } from '../../lib/api'

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
}

/**
 * Category-free scrollable grid of menu items. Shared visual language
 * between TabletLayout and LandscapeKioskLayout — only the sizing classes
 * differ (larger cards, more columns on the kiosk).
 */
function MenuGrid({ menu, cart, capabilities, onAdd, gridClassName, cardClassName, imageClassName }: MenuGridProps) {
  return (
    <div className={gridClassName}>
      {menu.map((item) => (
        <button key={item.item} onClick={() => onAdd(item)} className={cardClassName}>
          {capabilities?.show_item_images && item.item_image && (
            <img
              src={item.item_image}
              alt={item.item_name}
              className={imageClassName ?? 'w-full object-cover'}
            />
          )}
          <div className="flex flex-1 flex-col gap-1 p-3">
            <div className="font-medium">{item.item_name}</div>
            <div className="text-muted-foreground">{item.rate}</div>
            {cart[item.item] && (
              <div className="mt-1 text-sm font-semibold text-primary">In cart: {cart[item.item].qty}</div>
            )}
          </div>
        </button>
      ))}
    </div>
  )
}

export default MenuGrid
