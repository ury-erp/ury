import * as React from "react";
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
  };
  /** Context (read-only, human-readable) columns included in CSV export alongside the editable column. */
  csvContextColumns?: CsvColumnSpec<T>[];
  isLoading?: boolean;
  emptyMessage?: string;
  className?: string;
  rowTone?: (row: T) => DataTableRowTone;
  /**
   * Bulk-set support ("Set all to 0", etc). Operates only on `rows` (the
   * caller's current visible/filtered subset). Omit to hide the control.
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
}

const defaultConfirm = (rowCount: number) =>
  typeof window !== "undefined" ? window.confirm(`Set ${rowCount} row${rowCount === 1 ? "" : "s"} to this value?`) : true;

export function EditableDataTable<T>({
  columns,
  rows,
  rowKey,
  editableColumn,
  csvContextColumns = [],
  isLoading,
  emptyMessage,
  className,
  rowTone,
  bulkSet,
  csv,
}: EditableDataTableProps<T>) {
  const { wheelGuardRef, handleCellKeyDown, registerCellRef } = useEditableTable({ visibleRows: rows, rowKey });
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const editableSpec: EditableColumnSpec<T> = {
    header: editableColumn.header,
    field: editableColumn.key,
    get: (row) => editableColumn.getValue(row),
  };

  const allColumns: DataTableColumn<T>[] = [
    ...columns,
    {
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
            ref={(el) => {
              registerCellRef(key)(el);
              wheelGuardRef(el);
            }}
            onChange={(e) => {
              const value = e.target.value === "" ? 0 : Number(e.target.value);
              editableColumn.onChange(row, value);
            }}
            onKeyDown={(e) => handleCellKeyDown(e, row)}
          />
        );
      },
    },
  ];

  const handleBulkSet = async () => {
    if (!bulkSet) return;
    const confirmFn = bulkSet.confirm ?? defaultConfirm;
    const ok = await confirmFn(rows.length);
    if (!ok) return;
    bulkSet.onApply(rows, bulkSet.value);
  };

  const handleExport = () => {
    if (typeof document === "undefined") return;
    const csvText = buildCsv(rows, rowKey, csvContextColumns, [editableSpec]);
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
    const currentKeys = new Set(rows.map(rowKey));
    const result = parseImportCsv(text, currentKeys, [editableSpec]);
    csv?.onImport?.(result);
  };

  return (
    <div className="flex flex-col gap-2">
      {(bulkSet || csv) && (
        <div className="flex items-center gap-2">
          {bulkSet && (
            <Button type="button" variant="ghost" size="sm" onClick={handleBulkSet}>
              {bulkSet.label}
            </Button>
          )}
          {csv && (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={handleExport}>
                Export CSV
              </Button>
              {csv.onImport && (
                <>
                  <Button type="button" variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
                    Import CSV
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
