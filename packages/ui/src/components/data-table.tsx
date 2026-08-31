import * as React from "react";
import { cn } from "../lib/cn";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  align?: "left" | "right";
}

export type DataTableRowTone = "default" | "danger" | "warning" | "selected" | undefined;

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  className?: string;
  onRowClick?: (row: T) => void;
  /**
   * Optional per-row tone hook, mirroring the mockup's `.warnrow` treatment.
   * Return "danger", "warning", or "selected" to wash a row in the corresponding tint
   * (e.g. to flag an anomaly, or to highlight a selected row); return "default" or undefined for no tint.
   * Purely additive — omitting this prop leaves existing rows unaffected.
   */
  rowTone?: (row: T) => DataTableRowTone;
}

const rowToneClasses: Record<"danger" | "warning" | "selected", string> = {
  danger: "bg-destructive-tint hover:bg-destructive-tint-border",
  warning: "bg-warning-tint hover:bg-warning-tint-border",
  // Precedence: danger > warning > selected. Selected maintains tint on hover to remain
  // distinguishable from a regular hover.
  selected: "bg-primary-tint hover:bg-primary-tint-border",
};

export function DataTable<T>({
  columns,
  rows,
  isLoading,
  emptyMessage = "No results found.",
  className,
  onRowClick,
  rowTone,
}: DataTableProps<T>) {
  return (
    <div className={cn("relative w-full overflow-auto rounded-lg border", className)}>
      <table className="w-full caption-bottom text-sm">
        <thead className="border-b border-hair bg-muted/50">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  "px-[14px] py-[7px] align-middle text-[11px] font-medium text-muted-foreground",
                  column.align === "right" ? "text-right" : "text-left"
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={columns.length} className="p-8 text-center text-muted-foreground">
                Loading…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="p-8 text-center text-muted-foreground">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => {
              const tone = rowTone?.(row);
              return (
                <tr
                  key={rowIndex}
                  className={cn(
                    "border-b border-hair transition-colors last:border-b-0",
                    tone === "danger" || tone === "warning" || tone === "selected"
                      ? rowToneClasses[tone as "danger" | "warning" | "selected"]
                      : "hover:bg-muted/50",
                    onRowClick && "cursor-pointer"
                  )}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        "px-[14px] py-[8px] align-middle text-[12.5px]",
                        column.align === "right" ? "text-right tabular-nums" : "text-left"
                      )}
                    >
                      {column.render
                        ? column.render(row)
                        : String((row as Record<string, unknown>)[column.key] ?? "")}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
