import { cn } from "../lib/cn";

/**
 * A small inline progress bar for use inside DataTable column render functions.
 * Shows a thin bar with fill percentage = value/max, with optional label.
 *
 * @example
 * <DataTable columns={[
 *   {
 *     key: 'progress',
 *     header: 'Completion',
 *     render: (row) => <MiniBar value={row.done} max={row.total} label={`${row.done}/${row.total}`} />
 *   }
 * ]} rows={data} />
 */
export interface MiniBarProps {
  value: number;
  max: number;
  /** Optional label to display next to or inside the bar (e.g., "68/70") */
  label?: string;
  /** Color tone for the fill. Defaults to "primary" (blue). */
  tone?: "primary" | "success" | "warning" | "danger";
  className?: string;
}

export function MiniBar({
  value,
  max,
  label,
  tone = "primary",
  className,
}: MiniBarProps) {
  const fillPercentage = max > 0 ? (value / max) * 100 : 0;

  const toneClasses = {
    primary: "bg-primary",
    success: "bg-success-600",
    warning: "bg-warning-600",
    danger: "bg-destructive",
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative h-1 w-14 min-w-14 overflow-hidden rounded-sm bg-gray-200">
        <div
          className={cn("h-full rounded-sm transition-all", toneClasses[tone])}
          style={{ width: `${fillPercentage}%` }}
        />
      </div>
      {label && <span className="text-xs font-medium text-foreground">{label}</span>}
    </div>
  );
}

/**
 * A small colored circle indicator for status or priority.
 * Use inside DataTable column render functions to show status at a glance.
 *
 * @example
 * <DataTable columns={[
 *   {
 *     key: 'status',
 *     header: 'Status',
 *     render: (row) => <StatusDot tone={row.status === 'complete' ? 'success' : 'neutral'} />
 *   }
 * ]} rows={data} />
 */
export interface StatusDotProps {
  tone: "success" | "warning" | "danger" | "neutral";
  className?: string;
}

export function StatusDot({ tone, className }: StatusDotProps) {
  const toneClasses = {
    success: "bg-success-600",
    warning: "bg-warning-600",
    danger: "bg-destructive",
    neutral: "bg-gray-400",
  };

  return (
    <div
      className={cn("h-2 w-2 rounded-full", toneClasses[tone], className)}
      role="presentation"
      aria-label={`Status: ${tone}`}
    />
  );
}

/**
 * A className string that applies numeric table cell conventions:
 * - Right-aligned text
 * - Tabular-nums for monospace digit alignment
 * - Monospace font family
 *
 * Use this with DataTable's `align: 'right'` for full numeric cell styling,
 * or apply it as a className override on individual cells.
 *
 * @example
 * // On a DataTable column:
 * <DataTable columns={[
 *   { key: 'value', header: 'Amount', align: 'right', render: (row) => (
 *       <span className={numericCellClass}>{row.amount.toFixed(2)}</span>
 *     )
 *   }
 * ]} rows={data} />
 *
 * // Or standalone on a td:
 * <td className={numericCellClass}>1,234.56</td>
 */
export const numericCellClass = cn(
  "text-right",
  "font-mono",
  "tabular-nums",
  "text-sm"
);
