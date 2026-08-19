import * as React from "react";
import { cn } from "../lib/cn";

export interface StatCardProps {
  label: string;
  value: string | number;
  delta?: {
    value: string;
    direction: "up" | "down" | "flat";
  };
  icon?: React.ReactNode;
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

export const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({ label, value, delta, icon, className }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-lg border border-border bg-card shadow-sm p-5", className)}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {icon ? <span className="text-muted-foreground/70">{icon}</span> : null}
      </div>
      <div className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{value}</div>
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
