import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../lib/cn"

// Mockup primitive (`ury-pos.html` lines 98-99, `.panel` / `.panel.pad`):
// a hairline-bordered, shadow-free surface at 9px radius. This is
// deliberately NOT `Card` — `Card` is a generic shadcn surface (rounded-lg,
// shadow-sm, several elevation variants) used broadly across existing
// `frontend/` call sites, and changing its box model would ripple into all
// of them. `Panel` exists alongside it as the mockup's own container shape;
// migrating a call site from `Card` to `Panel` is a deliberate per-page
// choice (see DENSITY_PLAN.md Wave 2/3), not something this component does
// on its own.
const panelVariants = cva("rounded-[9px] border border-hair bg-card overflow-hidden", {
  variants: {
    pad: {
      // `.panel.pad` is 14px/16px (two-axis) — see the panelX/panelY comment
      // in tailwind-preset.js for why it's a token pair rather than one key.
      true: "px-panelX py-panelY",
      false: "",
    },
  },
  defaultVariants: {
    pad: false,
  },
})

export interface PanelProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof panelVariants> {}

const Panel = React.forwardRef<HTMLDivElement, PanelProps>(
  ({ className, pad, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(panelVariants({ pad, className }))}
      {...props}
    />
  )
)
Panel.displayName = "Panel"

export { Panel, panelVariants }
