import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../lib/cn"

const skeletonVariants = cva("skeleton", {
  variants: {
    shape: {
      /** Matches a line of body text, including its line-height. */
      text: "h-4 rounded-sm",
      /** A heading or a large value (KPI figure, total). */
      heading: "h-7 rounded-md",
      /** A control-height block: input, button, select. */
      control: "h-11 rounded-md",
      /** A whole card or panel. */
      block: "rounded-lg",
      circle: "rounded-full",
    },
  },
  defaultVariants: { shape: "text" },
})

export interface SkeletonProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof skeletonVariants> {}

/**
 * Loading placeholder shaped like the content it stands in for.
 *
 * Preferred over a centred spinner wherever the final layout is known: the
 * page keeps its shape, so nothing jumps when data lands. A spinner is still
 * right for an action with no layout to preview (submitting, printing).
 *
 * Marked `aria-hidden` and inert to assistive tech — the *container* should
 * carry `aria-busy`, so a screen reader hears "loading" once instead of
 * announcing a dozen decorative blocks.
 */
const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, shape, ...props }, ref) => (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn(skeletonVariants({ shape }), className)}
      {...props}
    />
  )
)
Skeleton.displayName = "Skeleton"

/**
 * A paragraph of skeleton lines. The last line is short, which is what makes
 * a block of placeholders read as text rather than as a table.
 */
export interface SkeletonTextProps extends React.HTMLAttributes<HTMLDivElement> {
  lines?: number
}

const SkeletonText = React.forwardRef<HTMLDivElement, SkeletonTextProps>(
  ({ className, lines = 3, ...props }, ref) => (
    <div ref={ref} className={cn("space-y-2", className)} {...props}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          shape="text"
          className={i === lines - 1 ? "w-3/5" : "w-full"}
        />
      ))}
    </div>
  )
)
SkeletonText.displayName = "SkeletonText"

export { Skeleton, SkeletonText, skeletonVariants }
