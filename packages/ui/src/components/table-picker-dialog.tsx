import { useEffect, useMemo, useState } from 'react'
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

export interface PickerTableOption {
  name: string
  room: string
  seatsLabel?: string
  shape?: string
}

export interface TablePickerDialogLabels {
  title: string
  description: string
  currentLabel: string
  searchPlaceholder: string
  empty: string
  cancel: string
  confirm: string
  loading: string
  /** Fallback when onConfirm rejects without an Error.message. */
  errorFallback?: string
}

export interface TablePickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceName?: string
  options: PickerTableOption[]
  loading?: boolean
  error?: string | null
  onConfirm: (name: string) => Promise<void> | void
  labels: TablePickerDialogLabels
  renderIcon?: (shape?: string) => React.ReactNode
}

export function TablePickerDialog({
  open,
  onOpenChange,
  sourceName = '',
  options,
  loading = false,
  error = null,
  onConfirm,
  labels,
  renderIcon,
}: TablePickerDialogProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const errorFallback = labels.errorFallback ?? 'Failed'

  useEffect(() => {
    if (!open) return
    setSelected(null)
    setSearch('')
    setLocalError(null)
    setIsSubmitting(false)
  }, [open, sourceName])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const sorted = [...options].sort(
      (a, b) => a.room.localeCompare(b.room) || a.name.localeCompare(b.name)
    )
    if (!q) return sorted
    return sorted.filter(
      (t) => t.name.toLowerCase().includes(q) || t.room.toLowerCase().includes(q)
    )
  }, [options, search])

  const grouped = useMemo(() => {
    const groups: Array<{ room: string; tables: PickerTableOption[] }> = []
    for (const table of filtered) {
      const last = groups[groups.length - 1]
      if (last?.room === table.room) last.tables.push(table)
      else groups.push({ room: table.room, tables: [table] })
    }
    return groups
  }, [filtered])

  const handleConfirm = async () => {
    if (!selected) return
    setIsSubmitting(true)
    setLocalError(null)
    try {
      await onConfirm(selected)
      onOpenChange(false)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : errorFallback)
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
          <label className="mb-1 block text-sm font-medium text-gray-700">{labels.currentLabel}</label>
          <Input type="text" readOnly value={sourceName} variant="search" className="mb-4" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={labels.searchPlaceholder}
            variant="search"
            className="mb-3"
            disabled={isSubmitting || loading}
          />

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner hideMessage message={labels.loading} />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-4 text-sm text-gray-500">{labels.empty}</p>
          ) : (
            <div className="space-y-4">
              {grouped.map((group) => (
                <div key={group.room}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {group.room}
                  </p>
                  <div className="space-y-2">
                    {group.tables.map((table) => {
                      const isSelected = selected === table.name
                      return (
                        <Button
                          key={table.name}
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => setSelected(table.name)}
                          variant="ghost"
                          className={cn(
                            'flex h-auto w-full items-center gap-3 rounded-lg border p-3 text-left',
                            isSelected ? 'border-primary bg-primary-50/40' : 'border-border'
                          )}
                        >
                          {renderIcon?.(table.shape)}
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900">{table.name}</p>
                            {table.seatsLabel && (
                              <p className="text-xs text-gray-500">{table.seatsLabel}</p>
                            )}
                          </div>
                        </Button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {(error || localError) && (
          <p className="px-6 pb-2 text-sm text-red-600">{error || localError}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {labels.cancel}
          </Button>
          <Button onClick={handleConfirm} disabled={isSubmitting || !selected || loading}>
            {isSubmitting ? labels.loading : labels.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
