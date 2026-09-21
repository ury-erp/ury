import { useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from './button'
import { Input } from './input'
import { cn } from '../lib/cn'

export interface ExpandableSearchProps {
  value: string
  onChange: (value: string) => void
  isExpanded: boolean
  onExpandedChange: (expanded: boolean) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function ExpandableSearch({
  value,
  onChange,
  isExpanded,
  onExpandedChange,
  placeholder = 'Search…',
  disabled,
  className,
}: ExpandableSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isExpanded) inputRef.current?.focus()
  }, [isExpanded])

  return (
    <div className={cn('flex items-center', className)}>
      <Button
        type="button"
        onClick={() => onExpandedChange(true)}
        variant="secondary"
        size="sm"
        className={cn(
          'flex items-center gap-2 rounded-full',
          isExpanded && 'hidden',
          disabled && 'pointer-events-none opacity-50'
        )}
        disabled={disabled}
        aria-label="Open search"
      >
        <Search className="h-4 w-4" />
      </Button>

      <div
        className={cn(
          'transition-all duration-200 ease-in-out',
          isExpanded ? 'w-56 opacity-100' : 'w-0 opacity-0',
          disabled && 'opacity-50'
        )}
      >
        <div className={cn('relative h-9', !isExpanded && 'invisible')}>
          <Input
            ref={inputRef}
            type="text"
            placeholder={placeholder}
            variant="search"
            size="sm"
            className={cn('rounded-full', disabled && 'cursor-not-allowed')}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          />
          <Button
            type="button"
            onClick={() => {
              onExpandedChange(false)
              onChange('')
            }}
            variant="ghost"
            size="sm"
            className="absolute right-2 top-1/2 h-6 w-6 -translate-y-1/2 p-0 text-gray-400"
            disabled={disabled}
            aria-label="Close search"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
