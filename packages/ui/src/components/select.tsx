import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../lib/cn"
import { ChevronDown } from "lucide-react"

const selectVariants = cva(
  "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm font-normal ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-50 transition-colors appearance-none pr-8 bg-white",
  {
    variants: {
      variant: {
        default: "border-gray-200 focus:border-[#7C3AED] focus:ring-purple-100",
        error: "border-red-300 focus:border-red-500 focus:ring-red-200",
        success: "border-green-300 focus:border-green-500 focus:ring-green-200",
      },
      size: {
        default: "h-10 px-3 py-2 text-sm",
        sm: "h-8 px-2 py-1 text-xs",
        lg: "h-12 px-4 py-3 text-base",
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
  error?: boolean
  onValueChange?: (value: string) => void
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, variant, size, error, children, onChange, onValueChange, ...props }, ref) => {
    const selectVariant = error ? "error" : variant
    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange?.(e);
      onValueChange?.(e.target.value);
    };

    return (
      <div className="relative w-full">
        <select
          ref={ref}
          onChange={handleChange}
          className={cn(selectVariants({ variant: selectVariant, size, className }))}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
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
      className={cn("py-1 text-gray-800 bg-white", className)}
      {...props}
    >
      {children}
    </option>
  )
)
SelectItem.displayName = "SelectItem"

export { Select, SelectItem, selectVariants }
