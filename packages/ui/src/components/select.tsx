import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../lib/cn"
import { ChevronDown } from "lucide-react"

const selectVariants = cva(
  "flex h-10 w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-xs transition-colors hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border-gray-200 focus:border-primary-500 focus:ring-primary-500/20",
        error: "border-red-300 focus:border-red-500 focus:ring-red-200",
        success: "border-green-300 focus:border-green-500 focus:ring-green-200",
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
          "border-red-300 hover:border-red-400 focus-visible:border-red-500 focus-visible:ring-red-500",
        success:
          "border-green-300 hover:border-green-400 focus-visible:border-green-500 focus-visible:ring-green-500",
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
          <RadixSelect.Value placeholder={placeholder} className="placeholder:text-muted-foreground" />
          <RadixSelect.Icon asChild>
            <ChevronDown className="ml-2 w-4 h-4 text-gray-400 shrink-0" />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content
            className="z-50 w-[var(--radix-select-trigger-width)] min-w-[8rem] bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-80 overflow-y-auto px-1 py-1 outline-none focus:outline-none focus:ring-0 focus:border-gray-200"
            position="popper"
            sideOffset={4}
          >
            <RadixSelect.Viewport className="p-0">
              {children}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
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

// Export a properly styled SelectItem component
const SelectItem = React.forwardRef<
  React.ElementRef<typeof RadixSelect.Item>,
  React.ComponentPropsWithoutRef<typeof RadixSelect.Item>
>(({ className, children, ...props }, ref) => (
  <RadixSelect.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-pointer select-none items-center rounded-md px-3 py-2 text-sm text-gray-700 outline-none transition-colors border-0",
      "hover:bg-gray-100 focus:bg-gray-100 data-[highlighted]:bg-gray-100 data-[highlighted]:text-gray-900 focus:outline-none focus:ring-0 outline-none",
      "data-[state=checked]:bg-primary-50 data-[state=checked]:text-primary-700 data-[state=checked]:font-semibold",
      className
    )}
    {...props}
  >
    <RadixSelect.ItemText>{children}</RadixSelect.ItemText>
  </RadixSelect.Item>
))
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
