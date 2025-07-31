import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"
import { ChevronDown } from "lucide-react"
import * as RadixSelect from "@radix-ui/react-select"

const selectVariants = cva(
  "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-4 py-2 text-sm font-normal ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors",
  {
    variants: {
      variant: {
        default: "border-gray-200 focus:border-blue-500 focus:ring-blue-200",
        error: "border-red-300 focus:border-red-500 focus:ring-red-200",
        success: "border-green-300 focus:border-green-500 focus:ring-green-200",
      },
      size: {
        default: "h-10 px-3 py-2",
        sm: "h-8 px-2 py-1 text-xs",
        lg: "h-12 px-4 py-3",
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
            <ChevronDown className="ml-2 w-4 h-4 text-gray-400" />
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content
            className="z-50 w-[var(--radix-select-trigger-width)] bg-white border border-gray-200 rounded-lg shadow-lg mt-2 max-h-80 overflow-y-auto px-0 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
            position="popper"
            sideOffset={4}
          >
            <RadixSelect.Viewport>
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
      "px-4 py-2 text-sm text-gray-800 rounded-md cursor-pointer select-none transition-colors",
      "hover:bg-gray-50 focus:bg-gray-50",
      "data-[state=checked]:bg-primary-50 data-[state=checked]:text-primary-700 font-normal",
      className
    )}
    {...props}
  >
    <RadixSelect.ItemText>{children}</RadixSelect.ItemText>
  </RadixSelect.Item>
))
SelectItem.displayName = "SelectItem"

export { Select, SelectItem, selectVariants, RadixSelect } 