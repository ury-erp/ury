import * as React from "react";
import { cn } from "../lib/cn";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  /**
   * Column alignment, interpreted as *logical* start/end: "right" aligns to
   * the end of the reading direction, so numeric columns stay on the
   * outer edge in both LTR and RTL rather than jumping to the wrong side.
   */
  align?: "left" | "right";
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  /**
   * Shown in place of skeleton rows only when `skeletonRows` is 0. Both
   * default to English here because this package has no locale of its own;
   * callers pass an already-translated string.
   */
  loadingMessage?: string;
  /** Placeholder rows rendered while loading. 0 falls back to a text row. */
  skeletonRows?: number;
  /** Header stays visible while the body scrolls. */
  stickyHeader?: boolean;
  onRowClick?: (row: T, index: number) => void;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  isLoading,
  emptyMessage = "No results found.",
  loadingMessage = "Loading…",
  skeletonRows = 6,
  stickyHeader,
  onRowClick,
  className,
}: DataTableProps<T>) {
  return (
    <div
      className={cn(
        "relative w-full overflow-auto rounded-lg border bg-card",
        className
      )}
      // One busy announcement for the whole table, rather than one per
      // skeleton cell.
      aria-busy={isLoading || undefined}
    >
      <table className="w-full caption-bottom text-sm">
        <thead
          className={cn(
            "border-b bg-muted/50",
            // Sticky needs an opaque background or rows show through it.
            stickyHeader && "sticky top-0 z-10 bg-muted backdrop-blur"
          )}
        >
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "h-12 px-4 align-middle text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                  column.align === "right" ? "text-end" : "text-start"
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            skeletonRows > 0 ? (
              // Placeholder rows keep the table at its real height, so the
              // page does not collapse and re-expand when data lands.
              Array.from({ length: skeletonRows }).map((_, rowIndex) => (
                <tr key={`skeleton-${rowIndex}`} className="border-b">
                  {columns.map((column) => (
                    <td key={column.key} className="px-4 py-3.5">
                      <div
                        aria-hidden="true"
                        className={cn(
                          "skeleton h-4",
                          column.align === "right" ? "ms-auto w-16" : "w-full max-w-[12rem]"
                        )}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="p-8 text-center text-muted-foreground">
                  {loadingMessage}
                </td>
              </tr>
            )
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="p-8 text-center text-muted-foreground">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                onClick={onRowClick ? () => onRowClick(row, rowIndex) : undefined}
                className={cn(
                  "border-b transition-colors duration-fast last:border-0",
                  // Zebra striping at a very low alpha: enough to track a row
                  // across a wide report, not enough to look banded.
                  "even:bg-muted/20",
                  "hover:bg-primary-50/60",
                  onRowClick &&
                    "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                )}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(row, rowIndex);
                        }
                      }
                    : undefined
                }
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "p-4 align-middle",
                      column.align === "right" ? "text-end tabular-nums bidi-isolate" : "text-start"
                    )}
                  >
                    {column.render
                      ? column.render(row)
                      : String((row as Record<string, unknown>)[column.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
