import * as React from "react"
import { cn } from "../lib/cn"
import { Card, CardHeader, CardTitle, CardContent } from "./card"
import { Badge } from "./badge"

type Severity = "blocking" | "warning" | "info"

export interface AttentionItemProps {
  severity: Severity
  title: string
  detail?: string
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
          "flex items-center gap-3 px-4 py-3",
          "border-b border-border last:border-b-0",
          "hover:bg-accent/50 cursor-pointer transition-colors"
        )}
      >
        {/* Left severity bar */}
        <div
          className={cn(
            "w-1 flex-shrink-0 rounded-sm",
            "h-[calc(100%+24px)] mx-[-12px]",
            severityBarColorMap[severity]
          )}
        />

        {/* Content area */}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium leading-tight text-foreground">
            {title}
          </div>
          {detail && (
            <div className="text-xs leading-normal text-muted-foreground mt-1">
              {detail}
            </div>
          )}
        </div>

        {/* Right-aligned section */}
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          {amount && (
            <span className="text-xs font-medium text-muted-foreground">
              {amount}
            </span>
          )}
          {action && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                action.onClick()
              }}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium",
                "bg-primary text-primary-foreground",
                "hover:bg-primary/90",
                "transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
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
      <Card ref={ref} padding="none">
        {title && (
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle>{title}</CardTitle>
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
