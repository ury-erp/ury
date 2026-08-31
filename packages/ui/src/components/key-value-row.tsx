import * as React from "react"
import { cn } from "../lib/cn"

/**
 * A single label/value row for drawer detail sections — mirrors the `.kv`
 * pattern (label left, monospace value right-aligned, hairline
 * border-bottom). Meant to be composed under a `DrawerSectionLabel` inside a
 * `Drawer`'s `children`.
 *
 * @example
 * <DrawerSectionLabel>Details</DrawerSectionLabel>
 * <KeyValueRow label="Item" value={row.component_item} />
 * <KeyValueRow label="Qty" value={row.wasted_qty} />
 */
export interface KeyValueRowProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode
  value: React.ReactNode
}

const KeyValueRow = React.forwardRef<HTMLDivElement, KeyValueRowProps>(
  ({ label, value, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-baseline justify-between gap-3 border-b border-border py-1.5 text-[12.5px]",
        className
      )}
      {...props}
    >
      <span className="w-[46%] shrink-0 text-muted-foreground">{label}</span>
      <span className="ml-auto truncate font-mono text-xs text-foreground">{value}</span>
    </div>
  )
)
KeyValueRow.displayName = "KeyValueRow"

/**
 * Uppercase section label used above a group of `KeyValueRow`s inside a
 * `Drawer` body — mirrors the `.dsec` pattern.
 *
 * @example
 * <DrawerSectionLabel>Today</DrawerSectionLabel>
 */
export interface DrawerSectionLabelProps extends React.HTMLAttributes<HTMLDivElement> {}

const DrawerSectionLabel = React.forwardRef<HTMLDivElement, DrawerSectionLabelProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "mb-1.5 mt-4.5 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground first:mt-0",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
)
DrawerSectionLabel.displayName = "DrawerSectionLabel"

export { KeyValueRow, DrawerSectionLabel }
