import * as React from "react"
import { cn } from "../lib/cn"
import { Card, CardHeader, CardTitle, CardContent } from "./card"
import { Badge } from "./badge"
import { buttonVariants } from "./button"

type Severity = "blocking" | "warning" | "info"

export interface AttentionItemProps {
  severity: Severity
  title: string
  /** Secondary line. A node, not just a string, so callers can embed links
   *  (e.g. an "open in desk" affordance per listed item). Rendered inside a
   *  `div`, so block-level content is safe here. */
  detail?: React.ReactNode
  amount?: string
  action?: {
    label: string
    onClick: () => void
  }
}

const severityBarColorMap: Record<Severity, string> = {
  blocking: "bg-destructive",
  warning: "bg-warning-600",
  info: "bg-success-600",
}

const AttentionItem = React.forwardRef<HTMLDivElement, AttentionItemProps>(
  ({ severity, title, detail, amount, action }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center gap-3 px-[14px] py-[11px]",
          "border-b border-border last:border-b-0",
          "hover:bg-muted/60 cursor-pointer transition-colors"
        )}
      >
        {/* Left severity bar */}
        <div
          className={cn(
            "w-[3px] flex-shrink-0 rounded-sm self-stretch",
            severityBarColorMap[severity]
          )}
        />

        {/* Content area */}
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold leading-tight text-foreground">
            {title}
          </div>
          {detail && (
            <div className="text-[11.5px] leading-normal text-muted-foreground mt-[1px]">
              {detail}
            </div>
          )}
        </div>

        {/* Right-aligned section */}
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          {amount && (
            <span className="font-mono text-xs text-muted-foreground">
              {amount}
            </span>
          )}
          {action && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                action.onClick()
              }}
              className={buttonVariants({ variant: "chrome", size: "compact" })}
            >
              {action.label}
            </button>
          )}
        </div>
      </div>
    )
  }
)
AttentionItem.displayName = "AttentionItem"

export interface AttentionFeedProps {
  items: AttentionItemProps[]
  title?: string
}

const AttentionFeed = React.forwardRef<HTMLDivElement, AttentionFeedProps>(
  ({ items, title }, ref) => {
    return (
      <Card ref={ref} padding="none" variant="outlined" className="border shadow-none rounded-[9px]">
        {title && (
          <CardHeader className="flex flex-row items-center gap-2 space-y-0 py-[9px] px-3">
            <CardTitle className="text-[12.5px] font-semibold">{title}</CardTitle>
            <Badge variant="secondary" size="sm">
              {items.length}
            </Badge>
          </CardHeader>
        )}
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {items.map((item, index) => (
              <AttentionItem key={index} {...item} />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }
)
AttentionFeed.displayName = "AttentionFeed"

export { AttentionItem, AttentionFeed }
