import * as React from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { cn } from "../lib/cn"
import { Button } from "./button"

export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** What went wrong, in the user's language. */
  title: string
  /** The server's message, when there is one worth showing. */
  description?: string
  /** Re-runs the failed request. Omit only when nothing can be retried. */
  onRetry?: () => void
  retryLabel?: string
  size?: "sm" | "default"
}

/**
 * The "this failed" state, shared so every screen offers the same way out.
 *
 * Each page used to hand-roll its own: the sell screen offered a retry that
 * called `window.location.reload()`, and the tables and orders screens
 * offered none at all — a failed first request left the user with a sentence
 * and no way forward but to reload the whole app (UX-09).
 *
 * `onRetry` takes a callback rather than reloading, because re-running the
 * one request that failed keeps the rest of the session — the open tabs, the
 * cart, the scroll position — which a reload throws away.
 *
 * Distinct from `EmptyState` on purpose. "No tables match this filter" and
 * "the table list could not be loaded" look identical if both render as a
 * quiet centred sentence, and only one of them means the data is wrong.
 */
const ErrorState = React.forwardRef<HTMLDivElement, ErrorStateProps>(
  ({ className, title, description, onRetry, retryLabel, size = "default", ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center text-center animate-fade-in",
        size === "sm" ? "gap-2 px-4 py-8" : "gap-3 px-6 py-14",
        className
      )}
      {...props}
    >
      <div
        aria-hidden="true"
        className={cn(
          "flex items-center justify-center rounded-full bg-destructive/10 text-destructive",
          size === "sm" ? "h-10 w-10 [&_svg]:h-5 [&_svg]:w-5" : "h-14 w-14 [&_svg]:h-7 [&_svg]:w-7"
        )}
      >
        <AlertTriangle />
      </div>

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

      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-1 gap-2">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {retryLabel}
        </Button>
      ) : null}
    </div>
  )
)
ErrorState.displayName = "ErrorState"

export { ErrorState }
