import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../lib/cn"
import { ChevronDown } from "lucide-react"

const selectVariants = cva(
  [
    "flex w-full items-center justify-between rounded-md border border-input bg-background",
    "text-sm font-normal appearance-none cursor-pointer shadow-sm touch-manipulation",
    "placeholder:text-muted-foreground",
    "transition-[border-color,box-shadow] duration-150 ease-out",
    // Same focus treatment as Input/Textarea (was `focus:` + `ring-primary-100`,
    // a ring so pale it was effectively invisible on a white field).
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
    "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-gray-100 disabled:shadow-none",
  ],
  {
    variants: {
      variant: {
        default: "border-gray-200 hover:border-gray-300 focus-visible:border-primary",
        error:
          "border-destructive/40 hover:border-destructive/60 focus-visible:border-destructive focus-visible:ring-destructive",
        success:
          "border-success-300 hover:border-success-400 focus-visible:border-success-500 focus-visible:ring-success-500",
      },
      // Right padding is set per-size rather than once on the base: the base's
      // `pr-8` was being clobbered by each size's `px-*` (later class wins in
      // tailwind-merge), so the chevron sat on top of long option text.
      size: {
        default: "h-11 pl-3.5 pr-10 py-2 text-sm",
        sm: "h-9 pl-3 pr-8 py-1.5 text-xs",
        lg: "h-12 pl-4 pr-11 py-3 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'>,
    VariantProps<typeof selectVariants> {
  /** @deprecated Use `variant="error"` instead. */
  error?: boolean
  onValueChange?: (value: string) => void
  /** Renders as a disabled first option when no value is selected. */
  placeholder?: string
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, variant, size, error, placeholder, children, value, onChange, onValueChange, ...props }, ref) => {
    const selectVariant = error ? "error" : variant
    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange?.(e);
      onValueChange?.(e.target.value);
    };

    return (
      <div className="relative w-full">
        <select
          ref={ref}
          value={value}
          onChange={handleChange}
          className={cn(selectVariants({ variant: selectVariant, size, className }))}
          {...props}
        >
          {placeholder && (
            <option value="" disabled hidden={!!value}>
              {placeholder}
            </option>
          )}
          {children}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      </div>
    )
  }
)
Select.displayName = "Select"

export interface SelectItemProps extends React.OptionHTMLAttributes<HTMLOptionElement> {}

const SelectItem = React.forwardRef<HTMLOptionElement, SelectItemProps>(
  ({ className, children, ...props }, ref) => (
    <option
      ref={ref}
      className={cn("py-1 text-foreground bg-background", className)}
      {...props}
    >
      {children}
    </option>
  )
)
SelectItem.displayName = "SelectItem"

export { Select, SelectItem, selectVariants }
