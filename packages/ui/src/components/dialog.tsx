import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../lib/cn"
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
  // The overlay fades in rather than snapping on. `transition-opacity` did
  // nothing here — the node is mounted at its final opacity — so this needed
  // to be a keyframe, not a transition.
  "fixed inset-0 bg-black/50 backdrop-blur-sm animate-overlay-in",
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
  [
    // A modal is the topmost surface in the app, so it takes the top of the
    // elevation scale (xl) and one radius step above a Card (xl vs lg) — the
    // two together are what make it read as floating over the page rather
    // than pasted onto it.
    "relative bg-card text-card-foreground rounded-xl shadow-xl",
    "max-h-[90vh] overflow-hidden animate-dialog-in",
  ],
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
          type="button"
          onClick={onClose}
          aria-label="Close"
          // Was a bare 16px icon — a ~16px touch target on a tablet. Now a
          // 36px tappable square with a real hover surface, matching the
          // ghost button's interaction language.
          className="absolute top-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-out hover:bg-accent hover:text-foreground active:bg-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:pointer-events-none"
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
    className={cn("flex flex-col space-y-1 text-center sm:text-left p-6", className)}
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
    // `gap-2` rather than `sm:space-x-2`: the stacked mobile layout previously
    // had no gap at all between its buttons.
    className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end p-6 pt-0", className)}
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
    className={cn("text-lg font-semibold leading-tight tracking-tight", className)}
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
    className={cn("text-sm leading-normal text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = "DialogDescription"

export { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, dialogVariants, contentVariants }
