import * as React from "react"
import { cn } from "../lib/cn"

export interface InlineEditCellProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type'> {
  value: string | number
  onChange: (value: string) => void
  onCommit?: (value: string) => void
  type?: 'text' | 'number'
  align?: 'left' | 'right'
  error?: boolean
  disabled?: boolean
}

const InlineEditCell = React.forwardRef<HTMLInputElement, InlineEditCellProps>(
  (
    {
      value,
      onChange,
      onCommit,
      type = 'text',
      align = 'right',
      error = false,
      disabled = false,
      className,
      ...props
    },
    ref
  ) => {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && onCommit) {
        e.preventDefault()
        onCommit(String(value))
      }
      props.onKeyDown?.(e)
    }

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      if (onCommit) {
        onCommit(String(value))
      }
      props.onBlur?.(e)
    }

    return (
      <input
        ref={ref}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        disabled={disabled}
        className={cn(
          // Base: minimal, compact, inline styling
          "inline-block h-6 w-full rounded-md px-2 py-0.5 text-sm font-mono",
          // Default: transparent background, minimal border (barely visible)
          "bg-transparent border border-transparent",
          // Text alignment
          align === 'right' ? 'text-right' : 'text-left',
          // Hover: subtle border appears
          "hover:border-border hover:bg-muted",
          // Focus: visible border and background (similar to input focus state)
          "focus:outline-none focus:border-primary focus:bg-primary-50 focus:ring-1 focus:ring-primary",
          // Error state: red border
          error && "border-destructive focus:border-destructive focus:bg-destructive-50 focus:ring-destructive text-destructive",
          // Disabled state
          disabled && "opacity-50 cursor-not-allowed",
          // Transition for smooth appearance changes
          "transition-[border-color,background-color,box-shadow] duration-150",
          className
        )}
        {...props}
      />
    )
  }
)

InlineEditCell.displayName = "InlineEditCell"

export { InlineEditCell }
