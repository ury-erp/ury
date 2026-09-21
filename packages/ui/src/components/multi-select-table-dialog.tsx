import { useEffect, useMemo, useState } from 'react'
import { Check, Link2 } from 'lucide-react'
import { Badge } from './badge'
import { Button } from './button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog'
import { cn } from '../lib/cn'

export interface MergeTableOption {
  name: string
  occupied?: number
  seatsLabel?: string
}

export interface MultiSelectTableDialogLabels {
  title: string
  description: string
  empty: string
  cancel: string
  confirm: string
  merging: string
  done: string
  selectedCount: (n: number) => string
}

export interface MultiSelectTableDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceName: string
  options: MergeTableOption[]
  onConfirm: (names: string[]) => Promise<void>
  labels: MultiSelectTableDialogLabels
  minAnimationMs?: number
  renderIcon?: (name: string) => React.ReactNode
}

type Phase = 'select' | 'merging' | 'done'

export function MultiSelectTableDialog({
  open,
  onOpenChange,
  sourceName,
  options,
  onConfirm,
  labels,
  minAnimationMs = 600,
  renderIcon,
}: MultiSelectTableDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [phase, setPhase] = useState<Phase>('select')

  useEffect(() => {
    if (open) {
      setSelected(new Set())
      setPhase('select')
    }
  }, [open, sourceName])

  const candidates = useMemo(
    () => options.filter((t) => t.occupied !== 1 && t.name !== sourceName),
    [options, sourceName]
  )

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const handleClose = () => {
    if (phase === 'merging') return
    onOpenChange(false)
  }

  const handleConfirm = async () => {
    if (selected.size === 0 || phase !== 'select') return
    const targets = Array.from(selected)
    setPhase('merging')
    const start = Date.now()
    try {
      await Promise.all([
        onConfirm(targets),
        new Promise((resolve) => {
          const remaining = Math.max(0, minAnimationMs - (Date.now() - start))
          setTimeout(resolve, remaining)
        }),
      ])
      setPhase('done')
      setTimeout(() => onOpenChange(false), 400)
    } catch {
      setPhase('select')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent
        variant="large"
        size="lg"
        onClose={phase === 'merging' ? undefined : handleClose}
        showCloseButton={phase !== 'merging'}
        className="overflow-y-auto"
      >
        {phase === 'select' && (
          <>
            <DialogHeader>
              <DialogTitle>{labels.title}</DialogTitle>
              <DialogDescription>{labels.description}</DialogDescription>
            </DialogHeader>
            <div className="max-h-64 overflow-y-auto px-6 pb-2">
              {candidates.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-500">{labels.empty}</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {candidates.map((table) => {
                    const isSelected = selected.has(table.name)
                    return (
                      <button
                        key={table.name}
                        type="button"
                        onClick={() => toggle(table.name)}
                        className={cn(
                          'flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-all',
                          isSelected ? 'border-primary bg-primary-50' : 'border-border hover:bg-gray-50'
                        )}
                      >
                        <div
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                            isSelected
                              ? 'border-foreground bg-foreground text-background'
                              : 'border-border bg-white'
                          )}
                        >
                          {isSelected && <Check className="h-3 w-3" />}
                        </div>
                        {renderIcon?.(table.name)}
                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-900">{table.name}</p>
                          {table.seatsLabel && (
                            <p className="text-xs text-gray-500">{table.seatsLabel}</p>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <DialogFooter>
              <div className="me-auto flex items-center gap-2">
                {selected.size > 0 && <Badge variant="secondary">{labels.selectedCount(selected.size)}</Badge>}
              </div>
              <Button variant="outline" onClick={handleClose}>
                {labels.cancel}
              </Button>
              <Button onClick={handleConfirm} disabled={selected.size === 0}>
                {labels.confirm}
              </Button>
            </DialogFooter>
          </>
        )}

        {phase === 'merging' && (
          <div className="flex flex-col items-center gap-3 px-6 py-10">
            <Link2 className="h-8 w-8 animate-pulse text-primary" />
            <p className="text-sm font-medium text-gray-700">{labels.merging}</p>
          </div>
        )}

        {phase === 'done' && (
          <div className="flex flex-col items-center gap-3 px-6 py-10">
            <Check className="h-8 w-8 text-green-600" />
            <p className="text-sm font-medium text-gray-700">{labels.done}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
