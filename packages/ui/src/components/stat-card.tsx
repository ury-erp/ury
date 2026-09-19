import * as React from "react";
import { cn } from "../lib/cn";
import { AnimatedNumber } from "./animated-number";

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  delta?: {
    value: string;
    direction: "up" | "down" | "flat";
  };
  icon?: React.ReactNode;
  /** Renders a placeholder in the value's shape instead of the figure. */
  isLoading?: boolean;
  /** Tints the left/start edge — use to group related tiles in a row. */
  tone?: "default" | "primary" | "success" | "warning" | "danger";
  className?: string;
}

const deltaIcon: Record<NonNullable<StatCardProps["delta"]>["direction"], string> = {
  up: "▲",
  down: "▼",
  flat: "—",
};

const deltaColor: Record<NonNullable<StatCardProps["delta"]>["direction"], string> = {
  up: "text-green-600",
  down: "text-red-600",
  flat: "text-gray-500",
};

// Logical border so the accent sits on the reading-start edge in both
// directions, rather than jumping to the far side of the card in Arabic.
const toneAccent: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "",
  primary: "border-s-2 border-s-primary",
  success: "border-s-2 border-s-green-500",
  warning: "border-s-2 border-s-amber-500",
  danger: "border-s-2 border-s-red-500",
};

/**
 * A single headline figure with an optional trend.
 *
 * The value goes through AnimatedNumber so a metric that refreshes on a timer
 * (today's sales, open covers) visibly acknowledges the change instead of
 * silently swapping — the one motion cue that carries real information on a
 * dashboard someone is watching rather than reading.
 */
export const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({ label, value, delta, icon, isLoading, tone = "default", className, ...props }, ref) => (
    <div
      ref={ref}
      aria-busy={isLoading || undefined}
      className={cn(
        "group rounded-lg border border-gray-200 bg-card p-5 shadow-sm lift",
        "hover:border-primary/25",
        toneAccent[tone],
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {icon ? (
          <span className="shrink-0 text-muted-foreground/60 transition-colors duration-fast group-hover:text-primary">
            {icon}
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <div aria-hidden="true" className="skeleton mt-2 h-8 w-24" />
      ) : (
        <AnimatedNumber
          value={value}
          className="mt-2 block text-3xl font-bold tracking-tight"
        />
      )}

      {delta && !isLoading ? (
        <div
          className={cn(
            "mt-1 flex items-center gap-1 text-xs font-medium",
            deltaColor[delta.direction]
          )}
        >
          <span aria-hidden="true">{deltaIcon[delta.direction]}</span>
          <span>{delta.value}</span>
        </div>
      ) : null}
    </div>
  )
);
StatCard.displayName = "StatCard";
