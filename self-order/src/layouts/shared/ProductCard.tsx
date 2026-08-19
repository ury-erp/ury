import type { MenuItem } from '../../lib/api'

export interface ProductCardProps {
  item: MenuItem
  cartQty: number
  showImage: boolean
  onClick: () => void
  imageClassName?: string
  cardClassName?: string
}

/**
 * Reusable product card component displaying a single menu item.
 * Shows item image (if enabled), name, price, and "in cart" quantity badge.
 * Primary interaction is onClick to add to cart.
 */
function ProductCard({
  item,
  cartQty,
  showImage,
  onClick,
  imageClassName = 'w-full object-cover',
  cardClassName = 'flex flex-col cursor-pointer',
}: ProductCardProps) {
  return (
    <button onClick={onClick} className={cardClassName}>
      {showImage && item.item_image && (
        <img src={item.item_image} alt={item.item_name} className={imageClassName} />
      )}
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="font-medium">{item.item_name}</div>
        <div className="text-muted-foreground">{item.rate}</div>
        {cartQty > 0 && (
          <div className="mt-1 text-sm font-semibold text-primary">In cart: {cartQty}</div>
        )}
      </div>
    </button>
  )
}

export default ProductCard
