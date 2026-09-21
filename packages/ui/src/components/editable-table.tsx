import * as React from "react";
import { Download, Upload } from "lucide-react";
import { DataTable, type DataTableColumn, type DataTableRowTone } from "./data-table";
import { Input } from "./input";
import { Button } from "./button";
import {
  useEditableTable,
  buildCsv,
  parseImportCsv,
  type CsvColumnSpec,
  type EditableColumnSpec,
  type CsvImportResult,
} from "./use-editable-table";

/**
 * DESIGN DECISION (documented per task requirements):
 *
 * `DataTable<T>` is a purely presentational component: columns + rows + a
 * `render` prop, no notion of cell focus, keyboard nav, or editing. Sales
 * Plan (and any future editable-grid page) needs a cell-focus registry that
 * is scoped PER TABLE INSTANCE (one department = one mounted table = its own
 * up/down nav boundary), plus bulk-set / CSV / wheel-guard behavior that has
 * nothing to do with rendering a generic table.
 *
 * Bolting all of that onto `DataTable` would turn a simple presentational
 * primitive into a stateful mega-component and would force every existing
 * `DataTable` consumer (history modals, BOM tables, etc.) to carry unused
 * editing machinery. Instead this file adds a NEW component,
 * `EditableDataTable`, that composes `DataTable` for rendering and layers
 * editing concerns on top via the `useEditableTable` hook (in
 * `use-editable-table.ts`). The hook owns the focus-ref registry, keyboard
 * nav, and wheel-guard; this component owns the surrounding chrome (search
 * slot passthrough, bulk-set confirm step, CSV export/import buttons) and
 * renders one designated numeric "editable" column plus arbitrary read-only
 * columns via the same `DataTableColumn` shape `DataTable` already uses.
 *
 * Zero Sales-Plan-specific assumptions: row identity, editable field name,
 * and context columns are all caller-supplied.
 */

export interface EditableDataTableColumn<T> extends DataTableColumn<T> {}

export interface EditableDataTableProps<T> {
  /** Read-only columns, rendered exactly like `DataTable` columns. */
  columns: EditableDataTableColumn<T>[];
  /** All rows the caller currently considers visible (post-search/filter). */
  rows: T[];
  /** Stable persisted-identity accessor — NOT assumed to be item_code/department. */
  rowKey: (row: T) => string;
  /** The single numeric column this table makes editable. */
  editableColumn: {
    key: string;
    header: string;
    align?: "left" | "right";
    getValue: (row: T) => number;
    onChange: (row: T, value: number) => void;
    min?: number;
    step?: number;
    /** Optional per-row aria-label for the rendered `<input>`. Omit for no aria-label (current behavior). */
    getAriaLabel?: (row: T) => string;
  };
  /**
   * Position within `columns` where the editable column should be inserted
   * (0 = first). Omit to keep current behavior — append at the end.
   */
  editableColumnIndex?: number;
  /** Context (read-only, human-readable) columns included in CSV export alongside the editable column. */
  csvContextColumns?: CsvColumnSpec<T>[];
  isLoading?: boolean;
  emptyMessage?: string;
  className?: string;
  rowTone?: (row: T) => DataTableRowTone;
  /**
   * Rows CSV export/import and bulk-set operate on. Defaults to `rows` when
   * omitted, so this is fully backward-compatible. Use this when `rows` is a
   * rendered/paginated subset (e.g. "show 10, expand for more") but CSV/bulk-set
   * should act on the full filtered set instead of just what's on screen.
   */
  dataRows?: T[];
  /**
   * Bulk-set support ("Set all to 0", etc). Operates on `dataRows` (falling
   * back to `rows` if `dataRows` is omitted). Omit to hide the control.
   */
  bulkSet?: {
    label: string;
    value: number;
    /** Defaults to a native `window.confirm` naming the affected row count; override to customize. */
    confirm?: (rowCount: number) => boolean | Promise<boolean>;
    onApply: (rows: T[], value: number) => void;
  };
  /** CSV export/import support. Omit to hide the controls. */
  csv?: {
    filename?: string;
    onImport?: (result: CsvImportResult) => void;
  };
  /**
   * Fired when ArrowUp/ArrowDown would move focus past this table's first/last
   * row. Lets a consumer (e.g. a truncated/paginated view) expand and retry
   * focus instead of inspecting DOM indices.
   */
  onBoundaryReached?: (direction: "up" | "down") => void;
  /**
   * Optional content (e.g. a per-table filter input) rendered on the left of
   * the same toolbar row as the bulk-set/CSV actions, so a caller's filter
   * and this table's actions share one row instead of stacking in two.
   * Ignored when neither `bulkSet` nor `csv` is supplied (no toolbar row).
   */
  toolbarLeft?: React.ReactNode;
}

const defaultConfirm = (rowCount: number) =>
  typeof window !== "undefined" ? window.confirm(`Set ${rowCount} row${rowCount === 1 ? "" : "s"} to this value?`) : true;

export function EditableDataTable<T>({
  columns,
  rows,
  rowKey,
  editableColumn,
  editableColumnIndex,
  csvContextColumns = [],
  isLoading,
  emptyMessage,
  className,
  rowTone,
  dataRows,
  bulkSet,
  csv,
  onBoundaryReached,
  toolbarLeft,
}: EditableDataTableProps<T>) {
  const { wheelGuardRef, handleCellKeyDown, registerCellRef } = useEditableTable({
    visibleRows: rows,
    rowKey,
    onBoundaryReached,
  });
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const effectiveDataRows = dataRows ?? rows;

  const editableSpec: EditableColumnSpec<T> = {
    header: editableColumn.header,
    field: editableColumn.key,
    get: (row) => editableColumn.getValue(row),
  };

  const editableDataTableColumn: DataTableColumn<T> = {
    key: editableColumn.key,
    header: editableColumn.header,
    align: editableColumn.align ?? "right",
    render: (row: T) => {
      const key = rowKey(row);
      return (
        <Input
          type="number"
          size="sm"
          min={editableColumn.min}
          step={editableColumn.step ?? 1}
          value={editableColumn.getValue(row)}
          aria-label={editableColumn.getAriaLabel?.(row)}
          ref={(el) => {
            registerCellRef(key)(el);
            wheelGuardRef(key)(el);
          }}
          onChange={(e) => {
            const value = e.target.value === "" ? 0 : Number(e.target.value);
            editableColumn.onChange(row, value);
          }}
          // A "0" pre-filled qty is the common case (untouched suggestion
          // rows). Without this, clicking in lands the cursor at some
          // position around that "0" -- typing "1" then inserts next to it
          // (e.g. "0" + "1" -> "10") instead of replacing it, and Backspace
          // does nothing useful if the cursor isn't after the digit.
          // Selecting the whole value on focus/click means the first
          // keystroke always replaces it, matching how a spreadsheet cell
          // behaves. Deliberately does NOT clear-to-empty on focus: that
          // would make Tab-through-without-editing silently blank the cell.
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => handleCellKeyDown(e, row)}
        />
      );
    },
  };

  const allColumns: DataTableColumn<T>[] =
    editableColumnIndex === undefined
      ? [...columns, editableDataTableColumn]
      : [
          ...columns.slice(0, editableColumnIndex),
          editableDataTableColumn,
          ...columns.slice(editableColumnIndex),
        ];

  const handleBulkSet = async () => {
    if (!bulkSet) return;
    const confirmFn = bulkSet.confirm ?? defaultConfirm;
    const ok = await confirmFn(effectiveDataRows.length);
    if (!ok) return;
    bulkSet.onApply(effectiveDataRows, bulkSet.value);
  };

  const handleExport = () => {
    if (typeof document === "undefined") return;
    const csvText = buildCsv(effectiveDataRows, rowKey, csvContextColumns, [editableSpec]);
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csv?.filename ?? "export.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    const text = await file.text();
    const currentKeys = new Set(effectiveDataRows.map(rowKey));
    const result = parseImportCsv(text, currentKeys, [editableSpec]);
    csv?.onImport?.(result);
  };

  return (
    <div className="flex flex-col gap-2">
      {(toolbarLeft || bulkSet || csv) && (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">{toolbarLeft}</div>
          {(bulkSet || csv) && (
            <div className="flex shrink-0 items-center gap-0.5">
              {/* Export/Import are a related CSV round-trip pair: grouped
                  tightly together, quiet/low-weight so they don't compete
                  visually with the primary editable-qty column. */}
              {csv && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="compactSm"
                    onClick={handleExport}
                    title="Export this table to CSV"
                    className="gap-1 text-text-tertiary hover:text-foreground"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export
                  </Button>
                  {csv.onImport && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="compactSm"
                        onClick={() => fileInputRef.current?.click()}
                        title="Import CSV into this table"
                        className="gap-1 text-text-tertiary hover:text-foreground"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Import
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,text/csv"
                        hidden
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void handleImportFile(file);
                          e.target.value = "";
                        }}
                      />
                    </>
                  )}
                </>
              )}
              {/* A distinct, destructive, higher-consequence action -- kept
                  visually separate from the CSV pair by a thin divider and
                  the shared `text-destructive` token, not an invented color. */}
              {bulkSet && (
                <>
                  {csv && <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />}
                  <Button
                    type="button"
                    variant="ghost"
                    size="compactSm"
                    onClick={handleBulkSet}
                    title={`Set every item in this table's plan to ${bulkSet.value}`}
                    className="text-destructive hover:bg-destructive-tint hover:text-destructive"
                  >
                    {bulkSet.label}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}
      <DataTable
        columns={allColumns}
        rows={rows}
        isLoading={isLoading}
        emptyMessage={emptyMessage}
        className={className}
        rowTone={rowTone}
      />
    </div>
  );
}

export { useEditableTable, buildCsv, parseImportCsv, sanitizeCsvCell } from "./use-editable-table";
export type {
  CsvColumnSpec,
  EditableColumnSpec,
  CsvImportResult,
  UseEditableTableOptions,
  UseEditableTableResult,
} from "./use-editable-table";
