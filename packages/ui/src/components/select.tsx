import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../lib/cn"
import { ChevronDown } from "lucide-react"
import * as RadixSelect from "@radix-ui/react-select"

const selectVariants = cva(
  "flex h-10 w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-xs transition-colors hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border-gray-200 focus:border-primary-500 focus:ring-primary-500/20",
        error: "border-red-300 focus:border-red-500 focus:ring-red-200",
        success: "border-green-300 focus:border-green-500 focus:ring-green-200",
      },
      size: {
        default: "h-10 px-3 py-2 text-sm",
        sm: "h-9 px-3 py-1.5 text-sm",
        lg: "h-12 px-4 py-3 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface SelectProps extends Omit<React.ComponentPropsWithoutRef<typeof RadixSelect.Root>, 'size'>, VariantProps<typeof selectVariants> {
  error?: boolean
  children: React.ReactNode
  placeholder?: string
  className?: string
}

const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  ({ className, variant, size, error, children, placeholder = "Select an option", ...props }, ref) => {
    const selectVariant = error ? "error" : variant
    return (
      <RadixSelect.Root {...props}>
        <RadixSelect.Trigger
          ref={ref}
          className={cn(selectVariants({ variant: selectVariant, size, className }))}
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
SelectItem.displayName = "SelectItem"

export { Select, SelectItem, selectVariants, RadixSelect }
