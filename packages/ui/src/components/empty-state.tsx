import * as React from "react"
import { cn } from "../lib/cn"
import { Illustration, type IllustrationName } from "./illustration"

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Lucide icon (or any node). Rendered muted and oversized. */
  icon?: React.ReactNode
  /**
   * Name of a feature illustration from the shared Smart Restro set
   * (ury/public/illustrations, e.g. "menu", "purchases"). Takes the place of
   * `icon` for whole-page states; keep `icon` for small in-card ones.
   */
  illustration?: IllustrationName
  title: string
  description?: string
  /** Primary recovery action, if there is one the user can actually take. */
  action?: React.ReactNode
  size?: "sm" | "default"
}

/**
 * The "nothing here" state, shared so every app says it the same way.
 *
 * Replaces the bare centred sentence that each page used to hand-roll. An
 * empty state should answer two questions — what is missing, and what to do
 * about it — so `description` and `action` are first-class rather than
 * something each call site improvises.
 */
const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, icon, illustration, title, description, action, size = "default", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex flex-col items-center justify-center text-center animate-fade-in",
        size === "sm" ? "gap-2 px-4 py-8" : "gap-3 px-6 py-14",
        illustration && (size === "sm" ? "pt-4" : "pt-6"),
        className
      )}
      {...props}
    >
      {illustration ? (
        <Illustration name={illustration} size={size} />
      ) : icon ? (
        <div
          aria-hidden="true"
          className={cn(
            "flex items-center justify-center rounded-full bg-muted text-muted-foreground",
            size === "sm" ? "h-10 w-10 [&_svg]:h-5 [&_svg]:w-5" : "h-14 w-14 [&_svg]:h-7 [&_svg]:w-7"
          )}
        >
          {icon}
        </div>
      ) : null}

      <p
        className={cn(
          "font-semibold text-foreground",
          size === "sm" ? "text-sm" : "text-base"
        )}
      >
        {title}
      </p>

      {description ? (
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}

      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
)
EmptyState.displayName = "EmptyState"

export { EmptyState }
