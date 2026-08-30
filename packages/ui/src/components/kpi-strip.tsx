import * as React from "react";
import { cn } from "../lib/cn";

/**
 * Matches ury-app.html's `.stats`/`.st` pattern: a borderless row of stats
 * separated by hairline dividers, not a row of boxed cards. The mockup is
 * explicit about this ("stats strip — no boxes") — KpiStrip must not wrap
 * items in bordered/shadowed panels, that reads as a generic SaaS dashboard
 * instead of this product's own dense, quiet visual language.
 */
export type KpiTone = "default" | "success" | "warning" | "danger";

export interface KpiItemProps {
  label: string;
  value: string | number;
  /** Secondary line under the value — a comparison, a target, a timestamp. */
  hint?: string;
  /** Tints the value text only — no background, no border. */
  tone?: KpiTone;
}

const toneValueColor: Record<KpiTone, string> = {
  default: "text-foreground",
  success: "text-success-600",
  warning: "text-warning-600",
  danger: "text-destructive",
};

export interface KpiStripProps {
  items: KpiItemProps[];
  className?: string;
}

export const KpiStrip = React.forwardRef<HTMLDivElement, KpiStripProps>(
  ({ items, className }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex flex-wrap border-b border-border pb-4 mb-1",
        className
      )}
    >
      {items.map((item, index) => (
        <div
          key={index}
          className={cn(
            "flex-1 min-w-[140px] pr-5",
            index > 0 && "pl-5 border-l border-border"
          )}
        >
          <div className="text-[11px] text-muted-foreground">{item.label}</div>
          <div
            className={cn(
              "mt-[3px] text-[25px] font-semibold leading-[1.15] tracking-tight tabular-nums",
              toneValueColor[item.tone ?? "default"]
            )}
          >
            {item.value}
          </div>
          {item.hint ? (
            <div className="mt-[2px] text-[11.5px] text-muted-foreground/80">{item.hint}</div>
          ) : null}
        </div>
      ))}
    </div>
  )
);
KpiStrip.displayName = "KpiStrip";
