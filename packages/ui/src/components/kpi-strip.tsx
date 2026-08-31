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

/**
 * Above this count a single non-wrapping flex row can no longer fit every
 * item at typical widths (item min-width 140px), so we switch to a fixed
 * column grid instead of relying on flex-wrap. The mockup's `.stats` is a
 * single non-wrapping row and never faces more than a handful of items —
 * this threshold keeps every 2-6 item call site (16 Reports pages + POS
 * Dashboard) on the exact original flex code path, byte-for-byte.
 */
const WRAP_THRESHOLD = 6;

function KpiItemContent({ item }: { item: KpiItemProps }) {
  return (
    <>
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
    </>
  );
}

export const KpiStrip = React.forwardRef<HTMLDivElement, KpiStripProps>(
  ({ items, className }, ref) => {
    if (items.length <= WRAP_THRESHOLD) {
      // Original single-row flex layout, unchanged. Dividers are safe here
      // because these items are never expected to wrap in practice — this
      // is the common case (2-6 items) and must match the mockup exactly.
      return (
        <div
          ref={ref}
          className={cn(
            "flex flex-wrap border-b border-hair pb-stats-pb mb-stats-mb",
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
              <KpiItemContent item={item} />
            </div>
          ))}
        </div>
      );
    }

    // Above the threshold, wrapping is the expected common case, so a
    // content-driven `flex-wrap` divider (border tied to DOM index) can't
    // work: whichever item happens to land first on a visual row inherits
    // a dangling left rule, and which item that is depends on viewport
    // width. Instead we fix the column count per breakpoint (2 cols below
    // `sm`, 4 cols at `sm` and up) and compute the divider with `nth-child`
    // against that *fixed* column count, so "first item of a row" is a
    // compile-time-known position rather than a runtime measurement — a
    // divider can never land on it.
    return (
      <div
        ref={ref}
        className={cn(
          "grid grid-cols-2 sm:grid-cols-4 gap-y-4 border-b border-hair pb-stats-pb mb-stats-mb",
          "[&>*]:pr-5",
          "[&>*:not(:nth-child(2n+1))]:pl-5 [&>*:not(:nth-child(2n+1))]:border-l [&>*:not(:nth-child(2n+1))]:border-border",
          "sm:[&>*:not(:nth-child(4n+1))]:pl-5 sm:[&>*:not(:nth-child(4n+1))]:border-l sm:[&>*:not(:nth-child(4n+1))]:border-border",
          className
        )}
      >
        {items.map((item, index) => (
          <div key={index}>
            <KpiItemContent item={item} />
          </div>
        ))}
      </div>
    );
  }
);
KpiStrip.displayName = "KpiStrip";
