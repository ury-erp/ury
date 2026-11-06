import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../lib/cn"

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center whitespace-nowrap rounded-md",
    "text-sm font-medium leading-none tracking-[-0.006em]",
    // Touch ergonomics: no text selection or double-tap zoom on rapid taps.
    "select-none touch-manipulation",
    // Motion: one shared curve/duration for every state change, plus the
    // transform used by the pressed state.
    "transition-[background-color,border-color,color,box-shadow,transform,filter,opacity] duration-150 ease-out",
    // Pressed state — a small, consistent physical acknowledgement.
    "active:scale-[0.98]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
    "disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none disabled:active:scale-100",
    // Icons never eat the click, and never get squeezed by a long label.
    // Sizing is deliberately left to the call site's own icon classes.
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        // Press always reads *darker* than hover. Where the token ramp has a
        // darker step, use it; where it doesn't, `brightness-95` gets the same
        // result without inventing a colour.
        default:
          "bg-primary text-white shadow-sm hover:bg-primary/90 active:bg-primary-600 active:shadow-none",
        destructive:
          "bg-destructive text-white shadow-sm hover:bg-destructive/90 active:bg-destructive active:brightness-95 active:shadow-none",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground hover:border-gray-300 active:bg-gray-100 active:shadow-none",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 active:bg-gray-200 active:shadow-none",
        ghost:
          "hover:bg-accent hover:text-accent-foreground active:bg-gray-200",
        link: "underline-offset-4 hover:underline text-primary active:scale-100 active:text-primary-600",
        tab: "bg-gray-100 text-gray-700 font-medium border-0 hover:bg-gray-200 active:bg-gray-300 data-[selected=true]:bg-primary-50 data-[selected=true]:text-primary-700 data-[selected=true]:hover:bg-primary-100",
        success:
          "bg-green-600 text-white shadow-sm hover:bg-green-700 active:bg-green-800 active:shadow-none",
        warning:
          "bg-orange-600 text-white shadow-sm hover:bg-orange-700 active:bg-orange-800 active:shadow-none",
        danger:
          "bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800 active:shadow-none",
      },
      // Control height scale, shared with Input/Select so a button always
      // lines up with the field next to it: xs 32 / sm 36 / default 44 / lg 48.
      // `default` is 44px — the smallest comfortable touch target on a POS
      // tablet — rather than the 40px desktop convention.
      size: {
        default: "h-11 px-4",
        sm: "h-9 px-3 rounded-md",
        lg: "h-12 px-6 text-base rounded-md",
        icon: "h-11 w-11 p-0",
        xs: "h-8 px-2.5 text-xs rounded-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
