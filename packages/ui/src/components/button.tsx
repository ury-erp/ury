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
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground hover:border-border active:bg-accent/80 active:shadow-none",
        // Mockup's default `.btn`: inset 1px ring on a card surface instead
        // of a real border, so it sits flush against adjacent chrome. Kept
        // separate from `outline` (rather than changing it in place) because
        // `outline` is used broadly across existing call sites that expect a
        // real border/background pairing — swapping its box model risks
        // visible regressions we can't audit from this file alone.
        chrome:
          "bg-card text-foreground shadow-[inset_0_0_0_1px_hsl(var(--hair2))] hover:bg-muted active:bg-hair active:shadow-[inset_0_0_0_1px_hsl(var(--hair2))]",
        solid:
          "bg-foreground text-background shadow-none hover:bg-foreground/90 active:bg-foreground active:brightness-90",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 active:bg-secondary/60 active:shadow-none",
        ghost:
          "hover:bg-accent hover:text-accent-foreground active:bg-accent/80",
        link: "underline-offset-4 hover:underline text-primary active:scale-100 active:text-primary-600",
        tab: "bg-gray-100 text-gray-700 font-medium border-0 hover:bg-gray-200 active:bg-gray-300 data-[selected=true]:bg-primary-50 data-[selected=true]:text-primary-700 data-[selected=true]:hover:bg-primary-100",
        success:
          "bg-success-600 text-white shadow-sm hover:bg-success-700 active:bg-success-800 active:shadow-none",
        warning:
          "bg-warning-600 text-white shadow-sm hover:bg-warning-700 active:bg-warning-800 active:shadow-none",
        danger:
          "bg-destructive text-white shadow-sm hover:bg-destructive/90 active:bg-destructive active:brightness-95 active:shadow-none",
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
        // Mockup's dense `.btn` scale (28/24/36px), additive alongside the
        // touch-target-first defaults above — for chrome/toolbars, not
        // primary POS actions.
        compact: "h-7 px-2.5 text-xs rounded-[7px] gap-1.5",
        compactSm: "h-6 px-2 text-[11.5px] rounded-[7px] gap-1.5",
        compactLg: "h-9 px-3.5 text-[13px] rounded-[7px] gap-1.5",
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
