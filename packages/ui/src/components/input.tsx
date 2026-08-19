import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../lib/cn"

const inputVariants = cva(
  [
    "flex w-full rounded-md border border-input bg-background text-sm shadow-sm",
    "touch-manipulation",
    "file:border-0 file:bg-transparent file:text-sm file:font-medium",
    "placeholder:text-muted-foreground",
    "transition-[border-color,box-shadow,background-color] duration-150 ease-out",
    // One focus treatment across every control: a 2px `ring` halo offset from
    // the field, paired with a border tint. Previously this mixed `focus:` and
    // `focus-visible:` and three different ring colours per variant.
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
        search:
          "border-gray-200 bg-gray-50 shadow-none hover:border-gray-300 focus-visible:border-primary focus-visible:bg-background",
      },
      // Shared control height scale — sm 36 / default 44 / lg 48 — so an Input
      // sits flush with the Button or Select beside it.
      size: {
        default: "h-11 px-3.5 py-2",
        sm: "h-9 px-3 py-1.5 text-xs",
        lg: "h-12 px-4 py-3 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
  /** @deprecated Use `variant="error"` instead. */
  error?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, variant, size, error, type, ...props }, ref) => {
    const inputVariant = error ? "error" : variant
    
    return (
      <input
        type={type}
        className={cn(inputVariants({ variant: inputVariant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input, inputVariants }
