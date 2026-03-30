import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"
import { X } from "lucide-react"

const dialogVariants = cva(
  "fixed inset-0 z-50 flex items-center justify-center",
  {
    variants: {
      variant: {
        default: "",
        fullscreen: "p-0",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const overlayVariants = cva(
  "fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity",
  {
    variants: {
      variant: {
        default: "",
        fullscreen: "bg-black/80",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const contentVariants = cva(
  "relative bg-white rounded-lg shadow-lg max-h-[90vh] overflow-hidden",
  {
    variants: {
      variant: {
        default: "w-full max-w-md mx-4",
        fullscreen: "w-full h-full max-w-none mx-0 rounded-none",
        large: "w-full max-w-2xl mx-4",
        xlarge: "w-full max-w-4xl mx-4",
      },
      size: {
        default: "",
        sm: "max-w-sm",
        lg: "max-w-lg",
        xl: "max-w-xl",
        "2xl": "max-w-2xl",
        "3xl": "max-w-3xl",
        "4xl": "max-w-4xl",
        "5xl": "max-w-5xl",
        "6xl": "max-w-6xl",
        "7xl": "max-w-7xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface DialogProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof dialogVariants> {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const Dialog = React.forwardRef<HTMLDivElement, DialogProps>(
  ({ className, variant, open, onOpenChange, children, ...props }, ref) => {
    if (!open) return null

    return (
      <div
        ref={ref}
        className={cn(dialogVariants({ variant, className }))}
        {...props}
      >
        <div
          className={cn(overlayVariants({ variant }))}
          onClick={() => onOpenChange?.(false)}
        />
        {children}
      </div>
    )
  }
)
Dialog.displayName = "Dialog"

export interface DialogContentProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof contentVariants> {
  onClose?: () => void
  showCloseButton?: boolean
}

const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, variant, size, onClose, showCloseButton = true, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(contentVariants({ variant, size, className }))}
      onClick={(e) => e.stopPropagation()}
      {...props}
    >
      {showCloseButton && onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
      )}
      {children}
    </div>
  )
)
DialogContent.displayName = "DialogContent"

const DialogHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 text-center sm:text-left p-6", className)}
    {...props}
  />
))
DialogHeader.displayName = "DialogHeader"

const DialogFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 p-6 pt-0", className)}
    {...props}
  />
))
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
))
DialogTitle.displayName = "DialogTitle"

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = "DialogDescription"

export { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, dialogVariants, contentVariants } 