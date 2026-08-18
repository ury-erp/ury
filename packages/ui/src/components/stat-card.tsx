import * as React from "react";
import { Card, CardContent, CardHeader } from "./card";
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
    <Card ref={ref} className={cn("bg-white", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-6 pb-3">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      </CardHeader>
      <CardContent className="p-6 pt-0">
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        {delta ? (
          <div className={cn("mt-1 flex items-center gap-1 text-xs font-medium", deltaColor[delta.direction])}>
            <span aria-hidden="true">{deltaIcon[delta.direction]}</span>
            <span>{delta.value}</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
);
StatCard.displayName = "StatCard";
