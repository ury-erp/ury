import * as React from "react"
import { cn } from "../lib/cn"
import { X } from "lucide-react"

const drawerVariants = {
  base: "fixed top-0 right-0 bottom-0 z-50 bg-card text-card-foreground border-l border-border flex flex-col",
  open: "shadow-xl",
  closed: "",
}

const overlayVariants = {
  base: "fixed inset-0 z-40 bg-black/20 backdrop-blur-sm animate-overlay-in",
  closed: "pointer-events-none",
}

export interface DrawerProps extends React.HTMLAttributes<HTMLDivElement> {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  width?: string
}

const Drawer = React.forwardRef<HTMLDivElement, DrawerProps>(
  ({ open, onClose, title, children, footer, width = "440px", className, ...props }, ref) => {
    if (!open) return null

    return (
      <div {...props}>
        {/* Overlay/Scrim */}
        <div
          className={cn(overlayVariants.base, overlayVariants.closed)}
          onClick={onClose}
          aria-hidden="true"
        />

        {/* Drawer Panel */}
        <div
          ref={ref}
          className={cn(drawerVariants.base, open ? drawerVariants.open : drawerVariants.closed, className)}
          style={{
            width,
            transform: open ? "translateX(0)" : "translateX(100%)",
            transition: "transform 200ms cubic-bezier(0.32, 0.72, 0, 1)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start gap-2.5 px-4.5 py-4 border-b border-border flex-shrink-0">
            <div className="flex-1">
              <h2 className="text-base font-semibold leading-tight tracking-tight">{title}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close drawer"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-out hover:bg-accent hover:text-foreground active:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:pointer-events-none flex-shrink-0"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-4.5 py-4">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="flex-shrink-0 border-t border-border px-4.5 py-3 flex gap-2 flex-col-reverse sm:flex-row sm:justify-end">
              {footer}
            </div>
          )}
        </div>
      </div>
    )
  }
)
Drawer.displayName = "Drawer"

export { Drawer }
