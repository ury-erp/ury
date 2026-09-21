import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import * as React from "react";
import { EditableDataTable } from "./editable-table";
import { sanitizeCsvCell, buildCsv, parseImportCsv, type EditableColumnSpec } from "./use-editable-table";

// Fixture (a): Sales-Plan-item-like shape.
interface SalesPlanItemFixture {
  item_code: string;
  item_name: string;
  department: string;
  planned_qty: number;
}

// Fixture (b): a distinctly different, Production-Plan-item-like shape —
// different field names, different row key, no Sales-Plan code path.
interface ProductionPlanItemFixture {
  production_plan_id: string;
  bom_name: string;
  work_order_status: string;
  target_qty: number;
}

function renderSalesPlanTable(rows: SalesPlanItemFixture[], overrides: Partial<React.ComponentProps<typeof EditableDataTable<SalesPlanItemFixture>>> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <EditableDataTable<SalesPlanItemFixture>
      columns={[
        { key: "item_name", header: "Item" },
        { key: "department", header: "Department" },
      ]}
      rows={rows}
      rowKey={(r) => r.item_code}
      editableColumn={{
        key: "planned_qty",
        header: "Planned Qty",
        getValue: (r) => r.planned_qty,
        onChange,
      }}
      csvContextColumns={[
        { header: "Item Name", get: (r) => r.item_name },
        { header: "Department", get: (r) => r.department },
      ]}
      {...overrides}
    />
  );
  return { ...utils, onChange };
}

function renderProductionPlanTable(rows: ProductionPlanItemFixture[], overrides: Partial<React.ComponentProps<typeof EditableDataTable<ProductionPlanItemFixture>>> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <EditableDataTable<ProductionPlanItemFixture>
      columns={[
        { key: "bom_name", header: "BOM" },
        { key: "work_order_status", header: "Status" },
      ]}
      rows={rows}
      rowKey={(r) => r.production_plan_id}
      editableColumn={{
        key: "target_qty",
        header: "Target Qty",
        getValue: (r) => r.target_qty,
        onChange,
      }}
      csvContextColumns={[{ header: "BOM", get: (r) => r.bom_name }]}
      {...overrides}
    />
  );
  return { ...utils, onChange };
}

const salesPlanRows: SalesPlanItemFixture[] = [
  { item_code: "A1", item_name: "Chicken Biryani", department: "Indian", planned_qty: 10 },
  { item_code: "A2", item_name: "Fried Rice", department: "Chinese", planned_qty: 20 },
  { item_code: "A3", item_name: "Naan", department: "Indian", planned_qty: 30 },
];

const productionPlanRows: ProductionPlanItemFixture[] = [
  { production_plan_id: "PP-1", bom_name: "BOM-001", work_order_status: "Open", target_qty: 5 },
  { production_plan_id: "PP-2", bom_name: "BOM-002", work_order_status: "Open", target_qty: 15 },
];

describe("sanitizeCsvCell (formula-injection guard)", () => {
  it("prefixes values starting with =, +, -, @, tab, or carriage return", () => {
    expect(sanitizeCsvCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(sanitizeCsvCell("+1234")).toBe("'+1234");
    expect(sanitizeCsvCell("-1234")).toBe("'-1234");
    expect(sanitizeCsvCell("@cmd")).toBe("'@cmd");
    expect(sanitizeCsvCell("\tvalue")).toBe("'\tvalue");
    expect(sanitizeCsvCell("\rvalue")).toBe("'\rvalue");
  });

  it("does not touch a safe value", () => {
    expect(sanitizeCsvCell("Chicken Biryani")).toBe("Chicken Biryani");
    expect(sanitizeCsvCell(42)).toBe("42");
  });
});

describe("EditableDataTable — Sales-Plan-shaped fixture", () => {
  it("renders context and editable columns", () => {
    renderSalesPlanTable(salesPlanRows);
    expect(screen.getByText("Chicken Biryani")).toBeInTheDocument();
    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs).toHaveLength(3);
    expect((inputs[0] as HTMLInputElement).value).toBe("10");
  });

  it("focusing a qty input selects its current value, so the first keystroke replaces it (not appends next to a pre-filled 0)", () => {
    // selectionStart/selectionEnd are unsupported on type="number" inputs
    // (spec + jsdom both return null for them), so assert on the call
    // instead of the selection range it produces.
    const selectSpy = vi.spyOn(HTMLInputElement.prototype, "select");
    renderSalesPlanTable([{ item_code: "Z1", item_name: "Untouched Suggestion", department: "Indian", planned_qty: 0 }]);
    const input = screen.getByDisplayValue("0") as HTMLInputElement;
    fireEvent.focus(input);
    expect(selectSpy).toHaveBeenCalled();
    selectSpy.mockRestore();
  });

  it("wheel-guard blurs a focused number input on wheel instead of blocking page scroll", () => {
    renderSalesPlanTable(salesPlanRows);
    const input = screen.getAllByRole("spinbutton")[0] as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);

    const wheelEvent = new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true });
    const notPrevented = input.dispatchEvent(wheelEvent);

    // The event itself is never preventDefault()'d — page scroll is not blocked.
    expect(notPrevented).toBe(true);
    expect(wheelEvent.defaultPrevented).toBe(false);
    // Instead, focus is removed from the input, which stops the browser from
    // redirecting the wheel delta into the number input's value.
    expect(document.activeElement).not.toBe(input);
  });

  it("wheel-guard does nothing when the input is not focused", () => {
    renderSalesPlanTable(salesPlanRows);
    const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    const input = inputs[0];
    inputs[1].focus(); // focus elsewhere

    const wheelEvent = new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true });
    input.dispatchEvent(wheelEvent);

    expect(document.activeElement).toBe(inputs[1]);
  });

  it("wheel-guard listener is actually removed on unmount (no leak)", () => {
    const removeSpy = vi.spyOn(HTMLInputElement.prototype, "removeEventListener");
    const addSpy = vi.spyOn(HTMLInputElement.prototype, "addEventListener");
    const { unmount } = renderSalesPlanTable(salesPlanRows);

    const wheelAddCallsBeforeUnmount = addSpy.mock.calls.filter((c) => c[0] === "wheel").length;
    expect(wheelAddCallsBeforeUnmount).toBeGreaterThan(0);

    unmount();

    const wheelRemoveCallsAfterUnmount = removeSpy.mock.calls.filter((c) => c[0] === "wheel").length;
    expect(wheelRemoveCallsAfterUnmount).toBe(wheelAddCallsBeforeUnmount);

    removeSpy.mockRestore();
    addSpy.mockRestore();
  });

  it("keyboard nav: ArrowDown/ArrowUp move focus within visible rows, stopping at instance edges", () => {
    renderSalesPlanTable(salesPlanRows);
    const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    inputs[0].focus();
    fireEvent.keyDown(inputs[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(inputs[1]);

    fireEvent.keyDown(inputs[1], { key: "ArrowDown" });
    expect(document.activeElement).toBe(inputs[2]);

    // Stops at the last row — no crash, no cross-instance nav.
    fireEvent.keyDown(inputs[2], { key: "ArrowDown" });
    expect(document.activeElement).toBe(inputs[2]);

    fireEvent.keyDown(inputs[2], { key: "ArrowUp" });
    expect(document.activeElement).toBe(inputs[1]);
  });

  it("keyboard nav skips rows the caller marks as filtered-out (only visible rows are passed in)", () => {
    // Caller filters out A2 ("Fried Rice") before passing rows in.
    const visible = salesPlanRows.filter((r) => r.item_code !== "A2");
    renderSalesPlanTable(visible);
    const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    expect(inputs).toHaveLength(2);
    inputs[0].focus();
    fireEvent.keyDown(inputs[0], { key: "ArrowDown" });
    // Moves straight to A3's row (index 1 of the visible set), never touching A2.
    expect(document.activeElement).toBe(inputs[1]);
  });

  it("Enter commits and moves focus down one row", () => {
    const { onChange } = renderSalesPlanTable(salesPlanRows);
    const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    inputs[0].focus();
    fireEvent.change(inputs[0], { target: { value: "99" } });
    expect(onChange).toHaveBeenCalledWith(salesPlanRows[0], 99);
    fireEvent.keyDown(inputs[0], { key: "Enter" });
    expect(document.activeElement).toBe(inputs[1]);
  });

  it("bulk-set: confirm step names affected row count, applies only to the visible/filtered subset", async () => {
    const onApply = vi.fn();
    const confirmSpy = vi.fn().mockReturnValue(true);
    const visible = salesPlanRows.filter((r) => r.department === "Indian"); // A1, A3
    renderSalesPlanTable(visible, {
      bulkSet: { label: "Set all to 0", value: 0, confirm: confirmSpy, onApply },
    });

    fireEvent.click(screen.getByText("Set all to 0"));
    await Promise.resolve();

    expect(confirmSpy).toHaveBeenCalledWith(2);
    expect(onApply).toHaveBeenCalledWith(visible, 0);
  });

  it("bulk-set: declining the confirm step does not apply", async () => {
    const onApply = vi.fn();
    renderSalesPlanTable(salesPlanRows, {
      bulkSet: { label: "Set all to 0", value: 0, confirm: () => false, onApply },
    });
    fireEvent.click(screen.getByText("Set all to 0"));
    await Promise.resolve();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("CSV export/import round-trip, including unmatched-key reporting", () => {
    const csv = buildCsv(
      salesPlanRows,
      (r) => r.item_code,
      [
        { header: "Item Name", get: (r) => r.item_name },
        { header: "Department", get: (r) => r.department },
      ],
      [{ header: "Planned Qty", field: "planned_qty", get: (r) => r.planned_qty }]
    );

    expect(csv).toContain("_row_key,Item Name,Department,Planned Qty");
    expect(csv).toContain("A1,Chicken Biryani,Indian,10");

    // Simulate an edited CSV re-imported, plus one row whose key no longer exists.
    const editedCsv = csv.replace("A1,Chicken Biryani,Indian,10", "A1,Chicken Biryani,Indian,55") + "\r\nGONE,Old Item,Old Dept,7";

    const currentKeys = new Set(salesPlanRows.map((r) => r.item_code));
    const result = parseImportCsv<SalesPlanItemFixture>(editedCsv, currentKeys, [
      { header: "Planned Qty", field: "planned_qty", get: (r) => r.planned_qty },
    ]);

    expect(result.updated).toEqual(
      expect.arrayContaining([
        { rowKey: "A1", values: { planned_qty: "55" } },
        { rowKey: "A2", values: { planned_qty: "20" } },
        { rowKey: "A3", values: { planned_qty: "30" } },
      ])
    );
    expect(result.unmatched).toEqual([{ rowKey: "GONE", values: { planned_qty: "7" } }]);
  });

  it("CSV import/export is symmetric: a genuine leading-quote value round-trips unchanged", () => {
    const rows: SalesPlanItemFixture[] = [
      { item_code: "'hello", item_name: "'hello", department: "Indian", planned_qty: 10 },
    ];
    const csv = buildCsv(
      rows,
      (r) => r.item_code,
      [{ header: "Item Name", get: (r) => r.item_name }],
      [{ header: "Planned Qty", field: "planned_qty", get: (r) => r.planned_qty }]
    );
    // No guard prefix applied — "'hello" doesn't start with a guarded prefix.
    expect(csv).toContain("'hello,'hello,10");

    const result = parseImportCsv<SalesPlanItemFixture>(csv, new Set(["'hello"]), [
      { header: "Planned Qty", field: "planned_qty", get: (r) => r.planned_qty },
    ]);
    // Round-trips back to the exact original value, quote intact.
    expect(result.updated).toEqual([{ rowKey: "'hello", values: { planned_qty: "10" } }]);
  });

  it("CSV import/export is symmetric: a real formula value is guarded on export and restored on import", () => {
    const rows: SalesPlanItemFixture[] = [
      { item_code: "A1", item_name: "Item", department: "Indian", planned_qty: 0 },
    ];
    const editable: EditableColumnSpec<SalesPlanItemFixture>[] = [
      { header: "Formula", field: "formula", get: () => "=SUM(A1:A2)" },
    ];
    const csv = buildCsv(rows, (r) => r.item_code, [], editable);
    expect(csv).toContain("'=SUM(A1:A2)");

    const result = parseImportCsv<SalesPlanItemFixture>(csv, new Set(["A1"]), editable);
    expect(result.updated).toEqual([{ rowKey: "A1", values: { formula: "=SUM(A1:A2)" } }]);
  });

  it("CSV export neutralizes a formula-injection payload in an editable cell", () => {
    const malicious: SalesPlanItemFixture[] = [
      { item_code: "A1", item_name: "Chicken Biryani", department: "Indian", planned_qty: 10 },
    ];
    const csv = buildCsv(
      malicious,
      (r) => r.item_code,
      [{ header: "Item Name", get: (r) => r.item_name }],
      [{ header: "Note", field: "note", get: () => "=cmd|calc!A1" }]
    );
    expect(csv).toContain("'=cmd|calc!A1");
  });
});

describe("EditableDataTable — new API surface", () => {
  it("dataRows: CSV export/bulk-set operate on dataRows, not the rendered rows subset", async () => {
    const onApply = vi.fn();
    const confirmSpy = vi.fn().mockReturnValue(true);
    const rendered = salesPlanRows.slice(0, 1); // only A1 rendered/paginated
    renderSalesPlanTable(rendered, {
      dataRows: salesPlanRows, // full filtered set
      bulkSet: { label: "Set all to 0", value: 0, confirm: confirmSpy, onApply },
    });

    fireEvent.click(screen.getByText("Set all to 0"));
    await Promise.resolve();

    expect(confirmSpy).toHaveBeenCalledWith(salesPlanRows.length);
    expect(onApply).toHaveBeenCalledWith(salesPlanRows, 0);
  });

  it("dataRows: defaults to rows when omitted (backward compatible)", async () => {
    const onApply = vi.fn();
    const confirmSpy = vi.fn().mockReturnValue(true);
    renderSalesPlanTable(salesPlanRows, {
      bulkSet: { label: "Set all to 0", value: 0, confirm: confirmSpy, onApply },
    });
    fireEvent.click(screen.getByText("Set all to 0"));
    await Promise.resolve();
    expect(onApply).toHaveBeenCalledWith(salesPlanRows, 0);
  });

  it("editableColumnIndex: inserts the editable column at the given position instead of appending", () => {
    renderSalesPlanTable(salesPlanRows, { editableColumnIndex: 0 });
    // Header order reflects insertion position: editable header first.
    const headerRow = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headerRow[0]).toBe("Planned Qty");
  });

  it("editableColumnIndex: omitted keeps default append-at-end behavior", () => {
    renderSalesPlanTable(salesPlanRows);
    const headerRow = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headerRow[headerRow.length - 1]).toBe("Planned Qty");
  });

  it("getAriaLabel: sets aria-label on the rendered input when provided", () => {
    renderSalesPlanTable(salesPlanRows, {
      editableColumn: {
        key: "planned_qty",
        header: "Planned Qty",
        getValue: (r) => r.planned_qty,
        onChange: vi.fn(),
        getAriaLabel: (r) => `Planned quantity for ${r.item_name}`,
      },
    });
    expect(screen.getByLabelText("Planned quantity for Chicken Biryani")).toBeInTheDocument();
  });

  it("getAriaLabel: omitted leaves inputs without an aria-label (current behavior)", () => {
    renderSalesPlanTable(salesPlanRows);
    const input = screen.getAllByRole("spinbutton")[0];
    expect(input).not.toHaveAttribute("aria-label");
  });

  it("onBoundaryReached: fires with 'down' when ArrowDown is pressed past the last row", () => {
    const onBoundaryReached = vi.fn();
    renderSalesPlanTable(salesPlanRows, { onBoundaryReached });
    const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    inputs[2].focus();
    fireEvent.keyDown(inputs[2], { key: "ArrowDown" });
    expect(onBoundaryReached).toHaveBeenCalledWith("down");
  });

  it("onBoundaryReached: fires with 'up' when ArrowUp is pressed past the first row", () => {
    const onBoundaryReached = vi.fn();
    renderSalesPlanTable(salesPlanRows, { onBoundaryReached });
    const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    inputs[0].focus();
    fireEvent.keyDown(inputs[0], { key: "ArrowUp" });
    expect(onBoundaryReached).toHaveBeenCalledWith("up");
  });

  it("onBoundaryReached: not fired for in-bounds nav", () => {
    const onBoundaryReached = vi.fn();
    renderSalesPlanTable(salesPlanRows, { onBoundaryReached });
    const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    inputs[0].focus();
    fireEvent.keyDown(inputs[0], { key: "ArrowDown" });
    expect(onBoundaryReached).not.toHaveBeenCalled();
  });
});

describe("EditableDataTable — Production-Plan-shaped fixture (distinct field names/row key)", () => {
  it("renders and edits with a completely different schema, no Sales-Plan path exercised", () => {
    const { onChange } = renderProductionPlanTable(productionPlanRows);
    expect(screen.getByText("BOM-001")).toBeInTheDocument();
    const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    expect(inputs).toHaveLength(2);
    fireEvent.change(inputs[0], { target: { value: "42" } });
    expect(onChange).toHaveBeenCalledWith(productionPlanRows[0], 42);
  });

  it("keyboard nav is scoped to this table instance", () => {
    renderProductionPlanTable(productionPlanRows);
    const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    inputs[0].focus();
    fireEvent.keyDown(inputs[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(inputs[1]);
    fireEvent.keyDown(inputs[1], { key: "ArrowDown" });
    expect(document.activeElement).toBe(inputs[1]); // stops at last row of this instance
  });

  it("CSV round trip works against this distinct schema and its own row key", () => {
    const csv = buildCsv(
      productionPlanRows,
      (r) => r.production_plan_id,
      [{ header: "BOM", get: (r) => r.bom_name }],
      [{ header: "Target Qty", field: "target_qty", get: (r) => r.target_qty }]
    );
    expect(csv).toContain("PP-1,BOM-001,5");

    const currentKeys = new Set(productionPlanRows.map((r) => r.production_plan_id));
    const result = parseImportCsv<ProductionPlanItemFixture>(csv, currentKeys, [
      { header: "Target Qty", field: "target_qty", get: (r) => r.target_qty },
    ]);
    expect(result.updated).toHaveLength(2);
    expect(result.unmatched).toHaveLength(0);
  });
});
