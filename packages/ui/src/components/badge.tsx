import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../lib/cn"

const badgeVariants = cva(
  [
    "inline-flex items-center justify-center rounded-full border",
    // Badges carry status text a server reads at a glance across a counter:
    // never wrap, hold the semibold weight, and open the tracking slightly so
    // short labels stay legible at 12px.
    "whitespace-nowrap font-semibold leading-none tracking-[0.01em]",
    "transition-colors duration-150 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
  ],
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        success: "border-transparent bg-success-100 text-success-800",
        warning: "border-transparent bg-warning-100 text-warning-800",
        danger: "border-transparent bg-destructive/10 text-destructive",
        info: "border-transparent bg-primary-100 text-primary-800",
        pending: "border-transparent bg-warning-100 text-warning-800",
        completed: "border-transparent bg-success-100 text-success-800",
        cancelled: "border-transparent bg-muted text-muted-foreground",
      },
      // With leading-none these resolve to 20 / 24 / 28px pill heights — a
      // deliberate 4px step that mirrors the control scale below it.
      size: {
        default: "h-6 px-2.5 text-xs",
        sm: "h-5 px-2 text-xs",
        lg: "h-7 px-3 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
