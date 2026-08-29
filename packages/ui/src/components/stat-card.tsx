import * as React from "react";
import { cn } from "../lib/cn";

/**
 * `tone` lets a stat card carry meaning, not just a number. A cashier scanning
 * a row of four cards should be able to tell "money in" from "tables filling
 * up" before reading a single label, so the tone tints the icon chip and paints
 * a top rail in the same hue. `default` is deliberately identical to the
 * untinted card the report pages already render, so adopting tones is opt-in.
 */
export type StatCardTone = "default" | "primary" | "success" | "warning" | "danger";

export interface StatCardProps {
  label: string;
  value: string | number;
  delta?: {
    value: string;
    direction: "up" | "down" | "flat";
  };
  icon?: React.ReactNode;
  /** Semantic tint. Defaults to the neutral card. */
  tone?: StatCardTone;
  /** Secondary line under the value — a denominator, a target, a timestamp. */
  hint?: string;
  className?: string;
}

const deltaIcon: Record<NonNullable<StatCardProps["delta"]>["direction"], string> = {
  up: "▲",
  down: "▼",
  flat: "—",
};

const deltaColor: Record<NonNullable<StatCardProps["delta"]>["direction"], string> = {
  up: "text-success-600",
  down: "text-destructive",
  flat: "text-gray-500",
};

const toneRail: Record<StatCardTone, string> = {
  default: "",
  primary: "before:bg-primary",
  success: "before:bg-success-600",
  warning: "before:bg-warning-400",
  danger: "before:bg-destructive",
};

const toneChip: Record<StatCardTone, string> = {
  default: "bg-gray-100 text-gray-500",
  primary: "bg-primary-50 text-primary",
  success: "bg-success-50 text-success-700",
  warning: "bg-warning-50 text-warning-700",
  danger: "bg-red-50 text-destructive",
};

export const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({ label, value, delta, icon, tone = "default", hint, className }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm p-5",
        tone !== "default" &&
          "before:absolute before:inset-x-0 before:top-0 before:h-1 before:content-['']",
        toneRail[tone],
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {icon ? (
          tone === "default" ? (
            <span className="text-muted-foreground/70">{icon}</span>
          ) : (
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                toneChip[tone]
              )}
            >
              {icon}
            </span>
          )
        ) : null}
      </div>
      <div className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-xs text-gray-500">{hint}</div> : null}
      {delta ? (
        <div className={cn("mt-1 flex items-center gap-1 text-xs font-medium", deltaColor[delta.direction])}>
          <span aria-hidden="true">{deltaIcon[delta.direction]}</span>
          <span>{delta.value}</span>
        </div>
      ) : null}
    </div>
  )
);
StatCard.displayName = "StatCard";
