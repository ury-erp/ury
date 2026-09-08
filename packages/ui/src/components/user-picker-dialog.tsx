import { useEffect, useState } from 'react'
import { Button } from './button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog'
import { Input } from './input'
import { Spinner } from './spinner'
import { cn } from '../lib/cn'

export interface UserPickerOption {
  name: string
  label: string
}

export interface UserPickerDialogLabels {
  title: string
  description: string
  searchPlaceholder: string
  empty: string
  cancel: string
  confirm: string
  loading: string
  /** Fallback when onConfirm rejects without an Error.message. */
  errorFallback?: string
  currentLabel?: string
}

export interface UserPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  options: UserPickerOption[]
  loading?: boolean
  loadError?: string | null
  search: string
  onSearchChange: (value: string) => void
  onConfirm: (name: string) => Promise<void> | void
  labels: UserPickerDialogLabels
  /** Optional readonly “current” field (e.g. current captain). */
  sourceValue?: string
}

export function UserPickerDialog({
  open,
  onOpenChange,
  options,
  loading = false,
  loadError = null,
  search,
  onSearchChange,
  onConfirm,
  labels,
  sourceValue,
}: UserPickerDialogProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const errorFallback = labels.errorFallback ?? 'Failed'

  useEffect(() => {
    if (!open) return
    setSelected(null)
    setError(null)
    setIsSubmitting(false)
  }, [open, sourceValue])

  const handleConfirm = async () => {
    if (!selected) return
    setIsSubmitting(true)
    setError(null)
    try {
      await onConfirm(selected)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : errorFallback)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
      <DialogContent
        variant="large"
        size="lg"
        onClose={() => !isSubmitting && onOpenChange(false)}
        className="max-h-dialog-max-h overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>{labels.description}</DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-2">
          {sourceValue != null && sourceValue !== '' && (
            <>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {labels.currentLabel ?? 'Current'}
              </label>
              <Input type="text" readOnly value={sourceValue} variant="search" className="mb-4" />
            </>
          )}
          <Input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={labels.searchPlaceholder}
            variant="search"
            className="mb-3"
            disabled={isSubmitting}
          />
          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner hideMessage message={labels.loading} />
            </div>
          ) : loadError ? (
            <p className="py-4 text-sm text-red-600">{loadError}</p>
          ) : options.length === 0 ? (
            <p className="py-4 text-sm text-gray-500">{labels.empty}</p>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {options.map((user) => {
                const isSelected = selected === user.name
                return (
                  <Button
                    key={user.name}
                    type="button"
                    variant="ghost"
                    disabled={isSubmitting}
                    onClick={() => setSelected(user.name)}
                    aria-pressed={isSelected}
                    className={cn(
                      'h-auto w-full justify-start rounded-lg border p-3 text-left',
                      isSelected ? 'border-primary bg-primary-50/40' : 'border-border'
                    )}
                  >
                    <div>
                      <p className="font-medium text-gray-900">{user.label}</p>
                      <p className="text-xs text-gray-500">{user.name}</p>
                    </div>
                  </Button>
                )
              })}
            </div>
          )}
        </div>

        {error && <p className="px-6 pb-2 text-sm text-red-600">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {labels.cancel}
          </Button>
          <Button onClick={handleConfirm} disabled={isSubmitting || !selected || loading || !!loadError}>
            {isSubmitting ? labels.loading : labels.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
