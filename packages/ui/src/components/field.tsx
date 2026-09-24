import * as React from "react"
import { cn } from "../lib/cn"

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string
  /** Renders the required marker and sets the control's `aria-required`. */
  required?: boolean
  /** Validation message. Replaces `hint` while present and colours the label. */
  error?: string
  /** Helper text shown under the control when there is no error. */
  hint?: string
  /** `id` of the control, so the label and messages associate correctly. */
  htmlFor?: string
}

/**
 * Label + control + message wrapper.
 *
 * Exists because every form in the dashboard and POS hand-rolled this trio,
 * which is why required markers, error colours and spacing drifted between
 * pages — and why most fields had no programmatic link between the input and
 * its error at all.
 *
 * Pass the control's `id` as `htmlFor` and wire `aria-describedby` to
 * `\`${htmlFor}-message\`` on the control to complete the association.
 */
const Field = React.forwardRef<HTMLDivElement, FieldProps>(
  ({ className, label, required, error, hint, htmlFor, children, ...props }, ref) => {
    const message = error ?? hint
    return (
      <div ref={ref} className={cn("space-y-1.5", className)} {...props}>
        {label ? (
          <label
            htmlFor={htmlFor}
            className={cn(
              "block text-sm font-medium leading-none transition-colors duration-fast",
              error ? "text-destructive" : "text-foreground"
            )}
          >
            {label}
            {required ? (
              <span className="ms-1 text-destructive" aria-hidden="true">
                *
              </span>
            ) : null}
          </label>
        ) : null}

        {children}

        {message ? (
          <p
            id={htmlFor ? `${htmlFor}-message` : undefined}
            // Errors are assertive: the user has just been stopped and needs
            // to hear why. A passive hint must not interrupt them.
            role={error ? "alert" : undefined}
            className={cn(
              "text-xs leading-snug",
              error
                ? "text-destructive animate-slide-in"
                : "text-muted-foreground"
            )}
          >
            {message}
          </p>
        ) : null}
      </div>
    )
  }
)
Field.displayName = "Field"

export { Field }
