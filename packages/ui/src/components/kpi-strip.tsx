import * as React from "react";
import { StatCard, type StatCardProps } from "./stat-card";
import { cn } from "../lib/cn";

export interface KpiStripProps {
  items: StatCardProps[];
  className?: string;
}

export const KpiStrip = React.forwardRef<HTMLDivElement, KpiStripProps>(
  ({ items, className }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-wrap gap-4", className)}
    >
      {items.map((item, index) => (
        <div key={index} className="flex-1 min-w-[200px]">
          <StatCard {...item} />
        </div>
      ))}
    </div>
  )
);
KpiStrip.displayName = "KpiStrip";
