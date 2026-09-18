import * as React from "react";

/**
 * Row-visibility + keyboard-nav + bulk-set + CSV helpers backing `EditableDataTable`.
 * See `editable-table.tsx` for the design-decision writeup (new component that
 * wraps `DataTable`, rather than bolting registry state onto it).
 */

export interface CsvColumnSpec<T> {
  /** Column header used in exported CSV and expected in imported CSV. */
  header: string;
  /** Read the cell value for a row (called on export). */
  get: (row: T) => string | number | null | undefined;
}

export interface EditableColumnSpec<T> extends CsvColumnSpec<T> {
  /** Apply an imported/edited value back onto a plain-object patch for this column. */
  field: string;
}

export interface BulkSetResult<T> {
  rowKey: string;
  row: T;
}

export interface CsvImportResult {
  /** Rows found in the CSV whose key matched a row currently in the dataset. */
  updated: Array<{ rowKey: string; values: Record<string, string> }>;
  /** Rows found in the CSV whose key did NOT match any current row. */
  unmatched: Array<{ rowKey: string; values: Record<string, string> }>;
}

/**
 * Neutralizes CSV/Excel formula-injection payloads. Any cell whose string form
 * starts with `=`, `+`, `-`, `@`, a tab, or a carriage return is prefixed with
 * a `'` so spreadsheet software treats it as literal text, not a formula.
 */
export function sanitizeCsvCell(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(raw)) {
    return `'${raw}`;
  }
  return raw;
}

function csvEscapeField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Builds a CSV string from rows, given context (read-only) and editable column specs. */
export function buildCsv<T>(
  rows: T[],
  rowKeyFn: (row: T) => string,
  contextColumns: CsvColumnSpec<T>[],
  editableColumns: EditableColumnSpec<T>[]
): string {
  const headers = ["_row_key", ...contextColumns.map((c) => c.header), ...editableColumns.map((c) => c.header)];
  const lines = [headers.map(csvEscapeField).join(",")];
  for (const row of rows) {
    const cells = [
      csvEscapeField(sanitizeCsvCell(rowKeyFn(row))),
      ...contextColumns.map((c) => csvEscapeField(sanitizeCsvCell(c.get(row)))),
      ...editableColumns.map((c) => csvEscapeField(sanitizeCsvCell(c.get(row)))),
    ];
    lines.push(cells.join(","));
  }
  return lines.join("\r\n");
}

/** Minimal RFC4180-ish CSV parser sufficient for our own export format (quoted fields, CRLF/LF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      if (text[i + 1] === "\n") i += 1;
      pushRow();
      i += 1;
      continue;
    }
    if (ch === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/** Strips a leading `'` formula-injection guard character that our own export adds. */
function unsanitize(value: string): string {
  if (value.startsWith("'") && /^'[=+\-@\t\r]/.test(value)) {
    return value.slice(1);
  }
  return value;
}

/**
 * Parses a CSV shaped like `buildCsv`'s output and reports which rows matched
 * current dataset keys vs. did not (rather than silently dropping unmatched rows).
 */
export function parseImportCsv<T>(
  csvText: string,
  currentRowKeys: Set<string>,
  editableColumns: EditableColumnSpec<T>[]
): CsvImportResult {
  const table = parseCsv(csvText);
  if (table.length === 0) return { updated: [], unmatched: [] };
  const headers = table[0];
  const keyIdx = headers.indexOf("_row_key");
  const editableIdxByField = editableColumns.map((c) => ({
    field: c.field,
    idx: headers.indexOf(c.header),
  }));

  const updated: CsvImportResult["updated"] = [];
  const unmatched: CsvImportResult["unmatched"] = [];

  for (const line of table.slice(1)) {
    const rowKey = unsanitize(keyIdx >= 0 ? line[keyIdx] ?? "" : "");
    if (!rowKey) continue;
    const values: Record<string, string> = {};
    for (const { field, idx } of editableIdxByField) {
      if (idx >= 0) values[field] = unsanitize(line[idx] ?? "");
    }
    if (currentRowKeys.has(rowKey)) {
      updated.push({ rowKey, values });
    } else {
      unmatched.push({ rowKey, values });
    }
  }

  return { updated, unmatched };
}

export interface UseEditableTableOptions<T> {
  /** All rows the caller currently considers "visible" (post-filter/search/expand). Order matters for nav. */
  visibleRows: T[];
  /** Stable persisted-identity accessor for a row (NOT assumed to be item_code/department). */
  rowKey: (row: T) => string;
}

export interface UseEditableTableResult<T> {
  /** Ref callback for a numeric input: blocks page-scroll-driven value changes while focused. */
  wheelGuardRef: (el: HTMLInputElement | null) => void;
  /**
   * Keyboard handler for a cell in the designated editable column. Wire to
   * `onKeyDown` on the input. `ArrowUp`/`ArrowDown` move focus within
   * `visibleRows` (never past this table instance's own first/last row).
   * `Enter` commits (calls `onCommit`) and moves focus down one row.
   */
  handleCellKeyDown: (
    event: React.KeyboardEvent<HTMLInputElement>,
    row: T,
    onCommit?: (row: T) => void
  ) => void;
  /** Register/lookup an input element by row key so keyboard nav can focus it. */
  registerCellRef: (key: string) => (el: HTMLInputElement | null) => void;
}

/**
 * Hook backing `EditableDataTable`'s cell focus registry + keyboard nav +
 * wheel guard. Kept table-instance-scoped: nav only ever moves within the
 * `visibleRows` passed to *this* hook call, so multiple mounted tables (one
 * per department, say) never cross-navigate into each other.
 */
export function useEditableTable<T>({ visibleRows, rowKey }: UseEditableTableOptions<T>): UseEditableTableResult<T> {
  const cellRefs = React.useRef(new Map<string, HTMLInputElement>());

  const registerCellRef = React.useCallback(
    (key: string) => (el: HTMLInputElement | null) => {
      if (el) cellRefs.current.set(key, el);
      else cellRefs.current.delete(key);
    },
    []
  );

  const wheelGuardRef = React.useCallback((el: HTMLInputElement | null) => {
    const existing = (el as any)?.__wheelGuardCleanup as (() => void) | undefined;
    if (!el) return;
    if (existing) return;
    const onWheel = (e: WheelEvent) => {
      // Only block the page-scroll-changes-value behavior while this input is
      // focused; a non-passive native listener is required because React's
      // synthetic onWheel is passive by default and preventDefault() there
      // silently no-ops.
      if (document.activeElement === el) {
        e.preventDefault();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    (el as any).__wheelGuardCleanup = () => el.removeEventListener("wheel", onWheel);
  }, []);

  const handleCellKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>, row: T, onCommit?: (row: T) => void) => {
      const key = rowKey(row);
      const index = visibleRows.findIndex((r) => rowKey(r) === key);
      if (index === -1) return;

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        const nextIndex = event.key === "ArrowUp" ? index - 1 : index + 1;
        if (nextIndex < 0 || nextIndex >= visibleRows.length) return; // stop at this instance's own edge
        const nextKey = rowKey(visibleRows[nextIndex]);
        cellRefs.current.get(nextKey)?.focus();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        onCommit?.(row);
        const nextIndex = index + 1;
        if (nextIndex < visibleRows.length) {
          const nextKey = rowKey(visibleRows[nextIndex]);
          cellRefs.current.get(nextKey)?.focus();
        }
      }
    },
    [visibleRows, rowKey]
  );

  return { wheelGuardRef, handleCellKeyDown, registerCellRef };
}
