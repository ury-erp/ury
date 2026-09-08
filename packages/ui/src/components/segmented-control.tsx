import { Button } from './button'
import { cn } from '../lib/cn'

export interface SegmentedOption<T extends string = string> {
  value: T
  label: string
}

export interface SegmentedControlProps<T extends string = string> {
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

export function SegmentedControl<T extends string = string>({
  value,
  options,
  onChange,
  disabled,
  className,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('inline-flex rounded-lg border border-border bg-gray-50 p-1', className)}
    >
      {options.map((option) => {
        const selected = value === option.value
        return (
          <Button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-8 rounded-md px-3',
              selected && 'bg-white shadow-sm hover:bg-white'
            )}
          >
            {option.label}
          </Button>
        )
      })}
    </div>
  )
}
