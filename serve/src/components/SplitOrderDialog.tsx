import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@ury/ui'
import { splitBill } from '../lib/order-api'

export interface SplitOrderLine {
  /** POS Invoice Item row name (split_bill move key). */
  name: string
  item_name: string
  qty: number
  item_code?: string
  rate?: number
}

export interface SplitOrderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoiceId: string
  items: SplitOrderLine[]
  /** Customer DocType name (link id), not display label. */
  customerId?: string | null
  onSuccess?: (result: { source_invoice: string; new_invoice: string }) => void
}

function dedupeByRowName(items: SplitOrderLine[]): SplitOrderLine[] {
  const seen = new Set<string>()
  const out: SplitOrderLine[] = []
  for (const item of items) {
    if (!item.name || seen.has(item.name)) continue
    seen.add(item.name)
    out.push(item)
  }
  return out
}

function parseQty(raw: string): number {
  const n = Number(raw)
  return Number.isFinite(n) ? n : NaN
}

/**
 * Itemized bill split against `ury.ury.doctype.ury_order.ury_order.split_bill`.
 * Move qty must be > 0 in aggregate and leave remaining qty on the source bill.
 */
export function SplitOrderDialog({
  open,
  onOpenChange,
  invoiceId,
  items,
  customerId,
  onSuccess,
}: SplitOrderDialogProps) {
  const lines = useMemo(() => dedupeByRowName(items), [items])
  const [moveQty, setMoveQty] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    setSubmitting(false)
    setAttempted(false)
    setMoveQty(Object.fromEntries(lines.map((line) => [line.name, ''])))
  }, [open, invoiceId, lines])

  const parsedMoves = useMemo(() => {
    return lines.map((line) => {
      const raw = moveQty[line.name] ?? ''
      const qty = raw.trim() === '' ? 0 : parseQty(raw)
      return { line, qty, raw }
    })
  }, [lines, moveQty])

  const validationError = useMemo(() => {
    let moving = 0
    let remaining = 0
    for (const { line, qty, raw } of parsedMoves) {
      if (raw.trim() !== '' && !Number.isFinite(qty)) {
        return `Invalid quantity for ${line.item_name}`
      }
      if (qty < 0) {
        return `Quantity cannot be negative for ${line.item_name}`
      }
      if (qty > line.qty) {
        return `Cannot move more than ${line.qty} of ${line.item_name}`
      }
      moving += qty
      remaining += line.qty - qty
    }
    if (moving <= 0) {
      return 'Select a quantity greater than 0 to move.'
    }
    if (remaining <= 0) {
      return 'Leave at least some quantity on the original bill.'
    }
    return null
  }, [parsedMoves])

  const reviewMoves = parsedMoves.filter((row) => row.qty > 0)

  const hasAnyInput = parsedMoves.some((row) => row.raw.trim() !== '')
  const showValidation = Boolean(validationError) && (attempted || hasAnyInput)

  const canSubmit = !validationError && !submitting && Boolean(invoiceId) && hasAnyInput

  const handleConfirm = async () => {
    setAttempted(true)
    if (!canSubmit || validationError) return
    setSubmitting(true)
    setError(null)
    const itemsToMove = reviewMoves.map(({ line, qty }) => ({
      name: line.name,
      qty,
    }))
    try {
      const result = await splitBill(invoiceId, itemsToMove, customerId || undefined)
      onSuccess?.(result)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to split bill')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent
        variant="large"
        size="lg"
        onClose={() => !submitting && onOpenChange(false)}
        className="max-h-dialog-max-h overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>Split bill</DialogTitle>
          <DialogDescription>
            Choose how much of each line to move to a new invoice. At least one
            quantity must remain on the original bill.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-6 pb-2">
          {lines.length === 0 ? (
            <p className="py-4 text-sm text-gray-500">No items available to split.</p>
          ) : (
            <ul className="space-y-3">
              {lines.map((line) => (
                <li
                  key={line.name}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">{line.item_name}</p>
                      <p className="text-xs text-gray-500">
                        Available qty: {line.qty}
                        {line.item_code ? ` · ${line.item_code}` : ''}
                      </p>
                    </div>
                    <div className="w-28 shrink-0">
                      <label
                        className="mb-1 block text-xs font-medium text-gray-600"
                        htmlFor={`split-qty-${line.name}`}
                      >
                        Move qty
                      </label>
                      <Input
                        id={`split-qty-${line.name}`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={line.qty}
                        step="any"
                        value={moveQty[line.name] ?? ''}
                        disabled={submitting}
                        onChange={(e) =>
                          setMoveQty((prev) => ({
                            ...prev,
                            [line.name]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {reviewMoves.length > 0 && (
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="mb-2 text-sm font-medium text-gray-800">Moving to new invoice</p>
              <ul className="space-y-1 text-sm text-gray-700">
                {reviewMoves.map(({ line, qty }) => (
                  <li key={`review-${line.name}`}>
                    {line.item_name}: {qty}
                    <span className="text-gray-500">
                      {' '}
                      (leave {Number((line.qty - qty).toFixed(6))})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(error || showValidation) && (
            <p className="text-sm text-red-600" role="alert">
              {error || validationError}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => void handleConfirm()}
          >
            {submitting ? 'Splitting…' : 'Split bill'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default SplitOrderDialog
