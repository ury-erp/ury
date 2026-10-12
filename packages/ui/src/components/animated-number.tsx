import * as React from "react"
import { cn } from "../lib/cn"

export interface AnimatedNumberProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  /** The formatted value to display, e.g. `formatCurrency(total)`. */
  value: string | number
  /**
   * Animate on change. Off means the value swaps instantly — correct for a
   * figure the user is actively typing into.
   */
  animate?: boolean
}

/**
 * A numeric readout that acknowledges when it changes.
 *
 * Takes an already-formatted string rather than a raw number, so currency,
 * grouping and digit system stay the responsibility of `@ury/core`'s
 * formatters and the active locale — this component never formats, and so
 * can never render Arabic-Indic digits or the wrong separator.
 *
 * It deliberately does *not* count up through intermediate values: on a bill
 * total, a tween renders numbers that were never real, and a cashier reading
 * mid-animation would see a figure that is simply wrong. Instead the new
 * value slides in over 140ms — enough to catch the eye, too short to misread.
 *
 * Tabular figures keep the width stable so surrounding layout never shifts.
 */
const AnimatedNumber = React.forwardRef<HTMLSpanElement, AnimatedNumberProps>(
  ({ value, animate = true, className, ...props }, ref) => {
    const previous = React.useRef(value)
    // Bumping a key on change restarts the CSS animation; without it the
    // browser sees the same element and plays nothing on the second change.
    const [generation, setGeneration] = React.useState(0)

    React.useEffect(() => {
      if (previous.current !== value) {
        previous.current = value
        setGeneration((g) => g + 1)
      }
    }, [value])

    return (
      <span
        ref={ref}
        // The value is announced as a whole when it settles, rather than
        // letting a screen reader chase each re-render.
        aria-live="polite"
        aria-atomic="true"
        className={cn("inline-block tabular-nums", className)}
        {...props}
      >
        <span
          key={generation}
          className={cn(
            "inline-block",
            // Skipped on the very first render: a total that animates in on
            // page load looks like a glitch, not a change.
            animate && generation > 0 && "animate-value-in"
          )}
        >
          {value}
        </span>
      </span>
    )
  }
)
AnimatedNumber.displayName = "AnimatedNumber"

export { AnimatedNumber }
