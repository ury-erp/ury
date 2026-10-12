import * as React from "react"
import { cn } from "../lib/cn"

/** The feature illustrations served from ury/public/illustrations. */
export type IllustrationName =
  | "menu"
  | "purchases"
  | "inventory"
  | "recipes"
  | "tables"
  | "reservations"
  | "delivery"
  | "reports"
  | "feedback"
  | "offers"
  | "orders"
  | "setup"
  | "unavailable"
  | "kitchen-clear"
  | "kitchen-stations"
  | "kitchen-offline"

export interface IllustrationProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  name: IllustrationName
  size?: "sm" | "default"
}

/**
 * One of the Smart Restro feature illustrations: the soft clay-and-ivory
 * scenes that share the sign-in page's look. Decorative only — the text
 * beside it carries the meaning — so it is hidden from assistive tech.
 * Built by scripts/illustrations/build.py.
 */
const Illustration = ({ name, size = "default", className, ...props }: IllustrationProps) => (
  <img
    src={`/assets/ury/illustrations/${name}.svg`}
    alt=""
    aria-hidden="true"
    width={420}
    height={300}
    decoding="async"
    draggable={false}
    className={cn(
      "h-auto select-none motion-safe:animate-[ury-float_9s_ease-in-out_infinite]",
      size === "sm" ? "w-44" : "w-64 sm:w-80",
      className
    )}
    {...props}
  />
)

export { Illustration }
