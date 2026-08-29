import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "../lib/cn"

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  /** Visual size — mirrors the `sm` / `default` / `lg` scale used by Input. */
  size?: "sm" | "default" | "lg"
}

const boxSize: Record<NonNullable<CheckboxProps["size"]>, string> = {
  sm: "h-4 w-4",
  default: "h-5 w-5",
  lg: "h-6 w-6",
}

const iconSize: Record<NonNullable<CheckboxProps["size"]>, string> = {
  sm: "h-3 w-3",
  default: "h-3.5 w-3.5",
  lg: "h-4 w-4",
}

/**
 * A native `<input type="checkbox">` under the hood — this package has no
 * Radix checkbox dependency yet — styled so the checked state uses the same
 * primary accent as Button/Input, with the same focus-ring treatment as the
 * rest of the form controls. The check glyph is a peer-driven SVG overlay
 * since a styled native checkbox can't render its own tick.
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, size = "default", disabled, ...props }, ref) => {
    return (
      <span className={cn("relative inline-flex shrink-0", boxSize[size])}>
        <input
          type="checkbox"
          ref={ref}
          disabled={disabled}
          className={cn(
            "peer appearance-none shrink-0 rounded border border-input bg-background shadow-sm",
            "transition-colors duration-150 ease-out",
            "checked:bg-primary checked:border-primary",
            "hover:border-gray-300 checked:hover:bg-primary/90",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-gray-100 disabled:shadow-none",
            boxSize[size],
            className
          )}
          {...props}
        />
        <Check
          strokeWidth={3}
          className={cn(
            "pointer-events-none absolute inset-0 m-auto text-primary-foreground opacity-0 peer-checked:opacity-100",
            iconSize[size]
          )}
        />
      </span>
    )
  }
)
Checkbox.displayName = "Checkbox"

export { Checkbox }
