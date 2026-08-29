import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../lib/cn"

const alertVariants = cva(
  [
    "relative w-full rounded-lg border p-4",
    "flex gap-3",
    "[&>svg]:h-5 [&>svg]:w-5 [&>svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        info: "border-primary-200 bg-primary-50 text-primary-800 [&>svg]:text-primary",
        warning: "border-warning-200 bg-warning-50 text-warning-800 [&>svg]:text-warning-600",
        danger: "border-red-200 bg-red-50 text-red-700 [&>svg]:text-destructive",
        success: "border-success-200 bg-success-50 text-success-800 [&>svg]:text-success-600",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  }
)

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  /** Optional leading icon slot, e.g. `<AlertTriangle className="h-5 w-5" />`. */
  icon?: React.ReactNode
}

/**
 * Replaces the ad-hoc `bg-red-50 border-red-200 text-red-700`-style divs
 * hand-rolled across ~18 pages for warning/error/success messaging, drawing
 * on the same primary/destructive/warning/success token ramps as Badge and
 * StatCard so tone stays consistent across the package.
 */
const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, icon, children, ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn(alertVariants({ variant, className }))}
      {...props}
    >
      {icon}
      <div className="flex-1 min-w-0 space-y-1">{children}</div>
    </div>
  )
)
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("text-sm font-semibold leading-tight tracking-tight", className)}
    {...props}
  />
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm leading-normal [&_p]:leading-normal", className)}
    {...props}
  />
))
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription, alertVariants }
