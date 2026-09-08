import { useEffect, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { cn } from '../lib/cn'

export interface MenuItemCardProps {
  name: string
  priceLabel: string
  imageUrl?: string | null
  course?: string
  onClick?: () => void
  disabled?: boolean
  unavailableMessage?: string | null
  className?: string
  /** Total qty in the active order for this item (including loaded rows). */
  quantity?: number
  onIncrement?: () => void
  onDecrement?: () => void
  incrementDisabled?: boolean
  decrementDisabled?: boolean
}

function formatQty(quantity: number): string {
  return Number.isInteger(quantity) ? String(quantity) : String(quantity)
}

export function MenuItemCard({
  name,
  priceLabel,
  imageUrl,
  course,
  onClick,
  disabled,
  unavailableMessage,
  className,
  quantity,
  onIncrement,
  onDecrement,
  incrementDisabled,
  decrementDisabled,
}: MenuItemCardProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const isDisabled = Boolean(disabled || unavailableMessage)
  const showImage = Boolean(imageUrl) && !imageFailed
  const showQtyControls = typeof quantity === 'number' && quantity > 0
  const canIncrement = Boolean(onIncrement) && !isDisabled && !incrementDisabled
  const canDecrement = Boolean(onDecrement) && !isDisabled && !decrementDisabled

  useEffect(() => {
    setImageFailed(false)
  }, [imageUrl])

  return (
    <div
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      aria-label={name}
      className={cn(
        'flex h-56 cursor-pointer flex-col overflow-hidden rounded-lg bg-white shadow-sm transition-shadow hover:shadow-md',
        isDisabled && 'pointer-events-none cursor-not-allowed opacity-50',
        className
      )}
      onClick={isDisabled ? undefined : onClick}
      onKeyDown={(e) => {
        if (isDisabled) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.()
        }
      }}
      aria-disabled={isDisabled || undefined}
    >
      <div className="relative h-24 shrink-0">
        {showImage ? (
          <img
            src={imageUrl!}
            alt={name}
            className="h-full w-full object-cover"
            style={{ filter: 'saturate(0.7) brightness(0.95)' }}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gray-200 text-2xl font-medium text-gray-400">
            {name.slice(0, 2).toUpperCase()}
          </div>
        )}
        {unavailableMessage && (
          <span className="absolute right-1 top-1 rounded bg-gray-900/80 px-2 py-0.5 text-[10px] font-medium text-white">
            {unavailableMessage}
          </span>
        )}
        {showQtyControls && (
          <div
            role="group"
            aria-label={`${name} quantity ${formatQty(quantity)}`}
            className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-white/95 px-0.5"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label={`Decrease ${name}`}
              disabled={!canDecrement}
              className={cn(
                'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-gray-800',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                'disabled:pointer-events-none disabled:opacity-40'
              )}
              onClick={(e) => {
                e.stopPropagation()
                onDecrement?.()
              }}
            >
              <Minus className="h-4 w-4" aria-hidden />
            </button>
            <span
              className="min-w-8 text-center text-sm font-semibold tabular-nums text-gray-900"
              aria-live="polite"
            >
              {formatQty(quantity)}
            </span>
            <button
              type="button"
              aria-label={`Increase ${name}`}
              disabled={!canIncrement}
              className={cn(
                'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-gray-800',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                'disabled:pointer-events-none disabled:opacity-40'
              )}
              onClick={(e) => {
                e.stopPropagation()
                onIncrement?.()
              }}
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-5 text-gray-900" title={name}>
          {name}
        </h3>
        <div className="mt-1 h-5">
          <p className="truncate text-xs text-gray-500" title={course}>
            {course || ' '}
          </p>
        </div>
        <div className="mt-auto pt-2">
          <span className="text-sm font-semibold tabular-nums text-gray-900">{priceLabel}</span>
        </div>
      </div>
    </div>
  )
}
