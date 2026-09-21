import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import { ArrowRightLeft, Link2, MoreVertical, Unlink, UserRound } from 'lucide-react'
import { Button } from './button'

export interface TableActionsMenuLabels {
  tableActions: string
  mergeTables: string
  unmergeTables: string
  transferTable: string
  transferCaptain: string
}

export interface TableActionsMenuProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  isAvailable: boolean
  isOccupied: boolean
  canUnmerge?: boolean
  onMerge?: () => void
  onUnmerge?: () => void
  onTransferTable?: () => void
  onTransferCaptain?: () => void
  showCaptainTransfer?: boolean
  labels: TableActionsMenuLabels
}

export function TableActionsMenu({
  isOpen,
  onOpenChange,
  isAvailable,
  isOccupied,
  canUnmerge = false,
  onMerge,
  onUnmerge,
  onTransferTable,
  onTransferCaptain,
  showCaptainTransfer = false,
  labels,
}: TableActionsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: globalThis.MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onOpenChange(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onOpenChange])

  const handleToggle = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onOpenChange(!isOpen)
  }

  const handleMerge = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onOpenChange(false)
    onMerge?.()
  }

  const handleUnmerge = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onOpenChange(false)
    onUnmerge?.()
  }

  const handleTransferTable = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onOpenChange(false)
    onTransferTable?.()
  }

  const handleTransferCaptain = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onOpenChange(false)
    onTransferCaptain?.()
  }

  const hasAvailableActions = isAvailable
  const hasOccupiedActions =
    isOccupied && (onMerge || onTransferTable || (showCaptainTransfer && onTransferCaptain))

  if (!hasAvailableActions && !hasOccupiedActions) {
    return null
  }

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative h-8 w-8 shrink-0 text-gray-600 hover:text-gray-900 before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']"
        onClick={handleToggle}
        aria-label={labels.tableActions}
        aria-expanded={isOpen}
      >
        <MoreVertical className="h-4 w-4" />
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-border bg-white py-1 shadow-lg">
          {isAvailable && (
            <>
              <Button
                variant="ghost"
                className="flex h-auto w-full justify-start gap-2 rounded-none px-4 py-2 text-sm font-normal text-gray-700 hover:bg-gray-100"
                onClick={handleMerge}
              >
                <Link2 className="h-4 w-4 shrink-0" />
                {labels.mergeTables}
              </Button>
              {canUnmerge && (
                <>
                  <div className="my-1 border-t border-gray-100" />
                  <Button
                    variant="ghost"
                    className="flex h-auto w-full justify-start gap-2 rounded-none px-4 py-2 text-sm font-normal text-red-600 hover:bg-red-50"
                    onClick={handleUnmerge}
                  >
                    <Unlink className="h-4 w-4 shrink-0" />
                    {labels.unmergeTables}
                  </Button>
                </>
              )}
            </>
          )}

          {isOccupied && (
            <>
              <Button
                variant="ghost"
                className="flex h-auto w-full justify-start gap-2 rounded-none px-4 py-2 text-sm font-normal text-gray-700 hover:bg-gray-100"
                onClick={handleMerge}
              >
                <Link2 className="h-4 w-4 shrink-0" />
                {labels.mergeTables}
              </Button>
              {onTransferTable && (
                <Button
                  variant="ghost"
                  className="flex h-auto w-full justify-start gap-2 rounded-none px-4 py-2 text-sm font-normal text-gray-700 hover:bg-gray-100"
                  onClick={handleTransferTable}
                >
                  <ArrowRightLeft className="h-4 w-4 shrink-0" />
                  {labels.transferTable}
                </Button>
              )}
              {showCaptainTransfer && onTransferCaptain && (
                <Button
                  variant="ghost"
                  className="flex h-auto w-full justify-start gap-2 rounded-none px-4 py-2 text-sm font-normal text-gray-700 hover:bg-gray-100"
                  onClick={handleTransferCaptain}
                >
                  <UserRound className="h-4 w-4 shrink-0" />
                  {labels.transferCaptain}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
