import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import * as React from "react";
import { EditableDataTable } from "./editable-table";
import { sanitizeCsvCell, buildCsv, parseImportCsv } from "./use-editable-table";

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

  it("wheel-guard blocks native wheel events on a focused number input", () => {
    renderSalesPlanTable(salesPlanRows);
    const input = screen.getAllByRole("spinbutton")[0] as HTMLInputElement;
    input.focus();

    const wheelEvent = new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true });
    const prevented = !input.dispatchEvent(wheelEvent);

    // A native, non-passive listener calling preventDefault() results in the
    // event being marked defaultPrevented / dispatchEvent returning false.
    expect(prevented).toBe(true);
    expect(wheelEvent.defaultPrevented).toBe(true);
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
