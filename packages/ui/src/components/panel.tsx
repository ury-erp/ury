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

// Mockup's `.sect` (`ury-pos.html` lines 93-96) is a header row that sits
// ABOVE and OUTSIDE the `.panel` border, as a sibling — every call site in
// the mockup is `<div class="sect">...</div><div class="panel">...</div>`,
// never `.sect` nested inside `.panel`. `PanelHeader` models that faithfully
// as a sibling component rather than an in-panel slot: putting it inside
// `Panel` would mean either drawing a divider the mockup doesn't have, or
// eating into `Panel`'s own padding in a way that doesn't match `.sect`'s
// unbordered, unpadded look. Keeping it a sibling also keeps `Panel` itself
// unchanged for every existing bare-panel call site (DashboardPage's four
// `Card`->`Panel` conversions included).
//
// Migration shape (Card + CardHeader + CardTitle -> Panel + PanelHeader):
//
//   <Card>                              <>
//     <CardHeader>                        <PanelHeader>
//       <CardTitle>Title</CardTitle>        <PanelTitle>Title</PanelTitle>
//     </CardHeader>                         {subtitle && <PanelSubtitle>{subtitle}</PanelSubtitle>}
//     <CardContent>                         {actions && <PanelActions>{actions}</PanelActions>}
//       ...content...                     </PanelHeader>
//     </CardContent>                       <Panel pad>
//   </Card>                                  ...content... (was CardContent)
//                                          </Panel>
//                                        </>
//
// `PanelSubtitle` is optional (maps to `.sect .n`, the muted count/subtitle
// beside the title) and `PanelActions` is optional (maps to `.sect .r`, the
// right-aligned action slot) — most `CardHeader`/`CardTitle` call sites have
// neither and migrate as just `<PanelHeader><PanelTitle>...</PanelTitle></PanelHeader>`.
const PanelHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center gap-[9px] mb-[9px]", className)}
      {...props}
    />
  )
)
PanelHeader.displayName = "PanelHeader"

// `.sect h2` — the section title. Rendered as an `h2` to match the mockup's
// markup and preserve document heading structure.
const PanelTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2
      ref={ref}
      className={cn("text-[12.5px] font-semibold m-0", className)}
      {...props}
    />
  )
)
PanelTitle.displayName = "PanelTitle"

// `.sect .n` — the muted count/subtitle beside the title (e.g. "2", "Open
// orders, oldest first").
const PanelSubtitle = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn("text-[11.5px] text-text-tertiary", className)}
      {...props}
    />
  )
)
PanelSubtitle.displayName = "PanelSubtitle"

// `.sect .r` — the right-aligned action slot (buttons, tags).
const PanelActions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("ml-auto flex items-center gap-[6px]", className)}
      {...props}
    />
  )
)
PanelActions.displayName = "PanelActions"

export { Panel, panelVariants, PanelHeader, PanelTitle, PanelSubtitle, PanelActions }
