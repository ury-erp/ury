import { useEffect, useState } from 'react'
import { Minus, Plus, X } from 'lucide-react'
import { Button } from './button'
import { Dialog, DialogContent } from './dialog'
import { Input } from './input'
import { cn } from '../lib/cn'

export interface ProductOption {
  id: string
  name: string
  priceLabel: string
}

export interface ProductConfiguratorLabels {
  specialInstructions: string
  specialInstructionsPlaceholder: string
  quantity: string
  variants: string
  addons: string
  loadingAddons: string
  noAddons: string
  total: string
  submit: string
}

export interface ProductConfiguratorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemName: string
  itemCode: string
  courseLabel?: string
  imageUrl?: string | null
  quantity: string
  onQuantityChange: (value: string) => void
  onQuantityBlur?: () => void
  onIncrement: () => void
  onDecrement: () => void
  comments: string
  onCommentsChange: (value: string) => void
  variants: ProductOption[]
  selectedVariantId?: string | null
  onSelectVariant: (id: string) => void
  addons: ProductOption[]
  selectedAddonIds: string[]
  onToggleAddon: (id: string) => void
  addonsLoading?: boolean
  addonsError?: string | null
  totalLabel: string
  submitDisabled?: boolean
  onSubmit: () => void
  labels: ProductConfiguratorLabels
}

export function ProductConfigurator({
  open,
  onOpenChange,
  itemName,
  itemCode,
  courseLabel,
  imageUrl,
  quantity,
  onQuantityChange,
  onQuantityBlur,
  onIncrement,
  onDecrement,
  comments,
  onCommentsChange,
  variants,
  selectedVariantId,
  onSelectVariant,
  addons,
  selectedAddonIds,
  onToggleAddon,
  addonsLoading,
  addonsError,
  totalLabel,
  submitDisabled,
  onSubmit,
  labels,
}: ProductConfiguratorProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = Boolean(imageUrl) && !imageFailed

  useEffect(() => {
    setImageFailed(false)
  }, [imageUrl])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="xlarge"
        className="flex max-h-dialog-max-h w-full max-w-[90rem] flex-col overflow-y-auto bg-white p-0 md:flex-row"
        showCloseButton={false}
      >
        <div className="relative h-40 shrink-0 sm:h-48 md:h-auto md:min-h-[16rem] md:w-1/3 md:self-stretch">
          {showImage ? (
            <img
              src={imageUrl!}
              alt={itemName}
              className="h-full w-full rounded-t-lg object-cover md:absolute md:inset-0 md:rounded-l-lg md:rounded-tr-none"
              style={{ filter: 'saturate(0.75) brightness(0.95)' }}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-t-lg bg-gray-200 text-4xl font-medium text-gray-400 sm:text-5xl md:absolute md:inset-0 md:rounded-l-lg md:rounded-tr-none md:text-6xl">
              {itemName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            variant="outline"
            size="icon"
            className="absolute right-3 top-3 bg-white shadow-lg"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="overflow-y-auto p-6 md:w-1/3">
          <h2 className="text-2xl font-bold text-gray-900">{itemName}</h2>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-sm text-gray-500">{itemCode}</span>
            {courseLabel && (
              <>
                <span className="text-gray-300">•</span>
                <span className="text-sm font-medium text-blue-600">{courseLabel}</span>
              </>
            )}
          </div>

          <div className="mt-6">
            <h3 className="mb-3 text-lg font-semibold">{labels.specialInstructions}</h3>
            <Input
              placeholder={labels.specialInstructionsPlaceholder}
              value={comments}
              onChange={(e) => onCommentsChange(e.target.value)}
            />
          </div>

          <div className="mt-6">
            <h3 className="mb-3 text-lg font-semibold">{labels.quantity}</h3>
            <div className="flex items-center gap-2" role="group" aria-label={labels.quantity}>
              <Button
                type="button"
                onClick={onDecrement}
                variant="outline"
                size="icon"
                aria-label={`Decrease ${labels.quantity}`}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                type="number"
                min="0"
                max="99"
                value={quantity}
                onChange={(e) => onQuantityChange(e.target.value)}
                onBlur={() => onQuantityBlur?.()}
                aria-label={labels.quantity}
                className="h-11 w-16 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <Button
                type="button"
                onClick={onIncrement}
                variant="outline"
                size="icon"
                aria-label={`Increase ${labels.quantity}`}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {variants.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-3 text-lg font-semibold">{labels.variants}</h3>
              <div className="flex flex-wrap gap-2">
                {variants.map((variant) => (
                  <Button
                    key={variant.id}
                    type="button"
                    onClick={() => onSelectVariant(variant.id)}
                    variant="outline"
                    aria-pressed={variant.id === selectedVariantId}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg p-2 text-left',
                      variant.id === selectedVariantId
                        ? 'border-blue-500 bg-blue-50 hover:border-blue-500'
                        : 'border-border hover:border-blue-200'
                    )}
                  >
                    <div className="font-medium">{variant.name}</div>
                    <div className="text-sm text-gray-500">{variant.priceLabel}</div>
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex h-auto flex-col overflow-y-auto border-t border-border p-6 md:w-1/3 md:border-l md:border-t-0">
          <div className="mb-6 overflow-y-auto">
            {addonsLoading ? (
              <div className="flex items-center justify-center text-gray-500">{labels.loadingAddons}</div>
            ) : addonsError ? (
              <div className="flex items-center justify-center text-red-500">{addonsError}</div>
            ) : addons.length > 0 ? (
              <div>
                <h3 className="mb-3 text-lg font-semibold">{labels.addons}</h3>
                <div className="space-y-2">
                  {addons.map((addon) => (
                    <Button
                      key={addon.id}
                      type="button"
                      onClick={() => onToggleAddon(addon.id)}
                      variant="outline"
                      aria-pressed={selectedAddonIds.includes(addon.id)}
                      className={cn(
                        'w-full rounded-lg p-3 text-left',
                        selectedAddonIds.includes(addon.id)
                          ? 'border-blue-500 bg-blue-50 hover:border-blue-500'
                          : 'border-border hover:border-blue-200'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span>{addon.name}</span>
                        <span className="text-sm text-gray-500">+{addon.priceLabel}</span>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center text-sm text-gray-400">{labels.noAddons}</div>
            )}
          </div>

          <div className="mt-auto border-t border-border pt-2">
            <div className="flex items-center justify-between text-lg font-semibold">
              <span>{labels.total}&nbsp;</span>
              <span>{totalLabel}</span>
            </div>
            <Button type="button" onClick={onSubmit} className="mt-4 w-full" size="lg" disabled={submitDisabled}>
              {labels.submit}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
