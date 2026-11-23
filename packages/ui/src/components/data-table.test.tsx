import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { DataTable } from "./data-table";

const rows = [{ a: "x", b: "y" }];

describe("DataTable column widths", () => {
  it("keeps the auto layout when no column sets a width", () => {
    const { container } = render(
      <DataTable columns={[{ key: "a", header: "A" }, { key: "b", header: "B" }]} rows={rows} />,
    );
    expect(container.querySelector("colgroup")).toBeNull();
    expect(container.querySelector("table")).not.toHaveClass("table-fixed");
  });

  it("uses a fixed layout with a colgroup when any column sets a width", () => {
    const { container } = render(
      <DataTable
        columns={[{ key: "a", header: "A", width: "30%" }, { key: "b", header: "B" }]}
        rows={rows}
      />,
    );
    expect(container.querySelector("table")).toHaveClass("table-fixed");
    const cols = container.querySelectorAll("col");
    expect(cols).toHaveLength(2);
    expect((cols[0] as HTMLElement).style.width).toBe("30%");
    expect((cols[1] as HTMLElement).style.width).toBe("");
  });
});
