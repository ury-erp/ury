import type { MenuItem } from '../../lib/api'

export interface ProductCardProps {
  item: MenuItem
  cartQty: number
  showImage: boolean
  onClick: () => void
  imageClassName?: string
  cardClassName?: string
  /** True when the item is out of stock (V3-44 availability gating) — the
   * card renders dimmed/non-interactive and ignores clicks. */
  disabled?: boolean
  /** Reason shown in place of the "in cart" badge when `disabled` is true
   * (e.g. "Out of stock", "Sold out for today"). */
  unavailableMessage?: string | null
}

/**
 * Reusable product card component displaying a single menu item.
 * Shows item image (if enabled), name, price, and "in cart" quantity badge
 * — or, when `disabled`, an availability message in place of that badge.
 * Primary interaction is onClick to add to cart.
 */
function ProductCard({
  item,
  cartQty,
  showImage,
  onClick,
  imageClassName = 'w-full object-cover',
  cardClassName = 'flex flex-col cursor-pointer',
  disabled = false,
  unavailableMessage = null,
}: ProductCardProps) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      className={`${cardClassName} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {showImage && item.item_image && (
        <img src={item.item_image} alt={item.item_name} className={imageClassName} />
      )}
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="font-medium">{item.item_name}</div>
        <div className="text-muted-foreground">{item.rate}</div>
        {unavailableMessage ? (
          <div className="mt-1 text-sm font-semibold text-destructive">{unavailableMessage}</div>
        ) : (
          cartQty > 0 && <div className="mt-1 text-sm font-semibold text-primary">In cart: {cartQty}</div>
        )}
      </div>
    </button>
  )
}

export default ProductCard
