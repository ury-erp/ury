import { formatCurrency, } from '@ury/core'
import { cn } from '@ury/ui'
import { Check } from 'lucide-react'
import type { MenuItem, OrderingCapabilities } from '../../lib/api'
import { t } from '../../i18n'

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
  if (!menu.length) return <p role="status" className="py-8 text-center text-muted-foreground">{t('menu.no_results_hint')}</p>
  return (
    <div className={gridClassName}>
      {menu.map((item, index) => {
        const inCart = cart[item.item]
        return (
          <button
            key={item.item}
            onClick={() => onAdd(item)}
            /* Index only drives the entrance stagger; the utility caps it. */
            style={{ '--i': index } as React.CSSProperties}
            className={cn(
              cardClassName,
              'group relative overflow-hidden animate-fade-in-up stagger-fast',
              'transition-[transform,box-shadow,border-color] duration-fast ease-out',
              'hover:-translate-y-0.5 hover:shadow-lg',
              /* A diner taps this on glass with no hover state at all, so the
                 press scale is the only feedback that the tap landed. */
              'active:translate-y-0 active:scale-[0.98]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              inCart && 'border-primary/40 ring-1 ring-primary/30',
            )}
          >
            {capabilities?.show_item_images && item.item_image && (
              <div className="overflow-hidden">
                <img
                  src={item.item_image}
                  alt=""
                  loading="lazy"
                  className={cn(
                    imageClassName ?? 'w-full object-cover',
                    'transition-transform duration-base ease-out group-hover:scale-105',
                  )}
                />
              </div>
            )}

            {/* Quantity already chosen. Sits over the image corner so the diner
                can see what they have picked while still scanning the menu. */}
            {inCart && (
              <span className="absolute end-2 top-2 flex min-w-badge-min items-center gap-1 rounded-full bg-primary px-2 py-1 text-xs font-bold text-primary-foreground shadow-md animate-check-in">
                <Check className="h-3 w-3" aria-hidden="true" />
                <span className="tabular-nums">{inCart.qty}</span>
              </span>
            )}

            <div className="flex flex-1 flex-col gap-1 p-3">
              <div className="font-medium">{item.item_name}</div>
              <div className="tabular-nums text-muted-foreground">{formatCurrency(item.rate)}</div>
              {inCart && (
                <div className="mt-1 text-sm font-semibold text-primary">
                  {t('order.in_cart', { qty: inCart.qty })}
                </div>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

export default MenuGrid
