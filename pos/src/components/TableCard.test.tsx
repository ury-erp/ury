import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import TableCard from "./TableCard";
import type { Table } from "../lib/table-api";

vi.mock("./TableShapeIcon", () => ({
  TableShapeIcon: ({ shape }: any) => <div data-testid="shape-icon">{shape}</div>,
}));

vi.mock("./TableActionsMenu", () => ({
  default: () => <div data-testid="actions-menu">Menu</div>,
}));

vi.mock("../i18n", () => ({
  t: (key: string, params?: any) => {
    if (params?.tables) return `Merged with ${params.tables}`;
    return key;
  },
}));

vi.mock("@ury/core", () => ({
  formatInvoiceTime: (time: string) => "10:00 AM",
}));

const mockTable: Table = {
  name: "Table-1",
  occupied: 0,
  no_of_seats: 4,
  restaurant_room: "Main Hall",
  latest_invoice_time: "2024-01-01 10:00:00",
  table_shape: "Rectangle",
  is_take_away: 0,
  branch: "Main Branch",
  company: "Test Company",
};

describe("TableCard", () => {
  it("renders table information", () => {
    render(
      <TableCard
        table={mockTable}
        menuOpen={false}
        onMenuOpenChange={() => {}}
        onMerge={() => {}}
        onUnmerge={() => {}}
        onNavigate={() => {}}
        onPreview={() => {}}
        onPrint={() => {}}
        isPrinting={false}
      />
    );

    expect(screen.getByText("Table-1")).toBeInTheDocument();
    expect(screen.getByText("Main Hall")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("shows available badge for available table", () => {
    render(
      <TableCard
        table={mockTable}
        menuOpen={false}
        onMenuOpenChange={() => {}}
        onMerge={() => {}}
        onUnmerge={() => {}}
        onNavigate={() => {}}
        onPreview={() => {}}
        onPrint={() => {}}
        isPrinting={false}
      />
    );

    expect(screen.getByText(/tables.available/i)).toBeInTheDocument();
  });

  it("shows occupied badge for occupied table", () => {
    const occupiedTable = { ...mockTable, occupied: 1 };
    render(
      <TableCard
        table={occupiedTable}
        menuOpen={false}
        onMenuOpenChange={() => {}}
        onMerge={() => {}}
        onUnmerge={() => {}}
        onNavigate={() => {}}
        onPreview={() => {}}
        onPrint={() => {}}
        isPrinting={false}
      />
    );

    expect(screen.getByText(/tables.occupied/i)).toBeInTheDocument();
  });

  it("shows preview and print buttons for occupied table", () => {
    const occupiedTable = { ...mockTable, occupied: 1 };
    render(
      <TableCard
        table={occupiedTable}
        menuOpen={false}
        onMenuOpenChange={() => {}}
        onMerge={() => {}}
        onUnmerge={() => {}}
        onNavigate={() => {}}
        onPreview={() => {}}
        onPrint={() => {}}
        isPrinting={false}
      />
    );

    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByText("Print")).toBeInTheDocument();
  });

  it("does not show preview and print buttons for available table", () => {
    render(
      <TableCard
        table={mockTable}
        menuOpen={false}
        onMenuOpenChange={() => {}}
        onMerge={() => {}}
        onUnmerge={() => {}}
        onNavigate={() => {}}
        onPreview={() => {}}
        onPrint={() => {}}
        isPrinting={false}
      />
    );

    expect(screen.queryByText("Preview")).not.toBeInTheDocument();
    expect(screen.queryByText("Print")).not.toBeInTheDocument();
  });

  it("calls onNavigate when available table is clicked", async () => {
    const handleNavigate = vi.fn();
    render(
      <TableCard
        table={mockTable}
        menuOpen={false}
        onMenuOpenChange={() => {}}
        onMerge={() => {}}
        onUnmerge={() => {}}
        onNavigate={handleNavigate}
        onPreview={() => {}}
        onPrint={() => {}}
        isPrinting={false}
      />
    );

    const cardElement = screen.getByRole("button");
    await userEvent.click(cardElement);

    expect(handleNavigate).toHaveBeenCalledTimes(1);
  });

  it("does not call onNavigate when occupied table is clicked", async () => {
    const handleNavigate = vi.fn();
    const occupiedTable = { ...mockTable, occupied: 1 };
    render(
      <TableCard
        table={occupiedTable}
        menuOpen={false}
        onMenuOpenChange={() => {}}
        onMerge={() => {}}
        onUnmerge={() => {}}
        onNavigate={handleNavigate}
        onPreview={() => {}}
        onPrint={() => {}}
        isPrinting={false}
      />
    );

    const cardElement = screen.getByRole("group");
    await userEvent.click(cardElement);

    expect(handleNavigate).not.toHaveBeenCalled();
  });

  it("renders merge group label when provided", () => {
    render(
      <TableCard
        table={mockTable}
        mergeGroupLabel="Table-1, Table-2"
        menuOpen={false}
        onMenuOpenChange={() => {}}
        onMerge={() => {}}
        onUnmerge={() => {}}
        onNavigate={() => {}}
        onPreview={() => {}}
        onPrint={() => {}}
        isPrinting={false}
      />
    );

    expect(screen.getByText(/Merged with Table-1, Table-2/i)).toBeInTheDocument();
  });

  it("shows printing state in print button", () => {
    const occupiedTable = { ...mockTable, occupied: 1 };
    render(
      <TableCard
        table={occupiedTable}
        menuOpen={false}
        onMenuOpenChange={() => {}}
        onMerge={() => {}}
        onUnmerge={() => {}}
        onNavigate={() => {}}
        onPreview={() => {}}
        onPrint={() => {}}
        isPrinting={true}
      />
    );

    expect(screen.getByText("Printing...")).toBeInTheDocument();
  });

  it("renders take away badge when applicable", () => {
    const takeAwayTable = { ...mockTable, is_take_away: 1 };
    render(
      <TableCard
        table={takeAwayTable}
        menuOpen={false}
        onMenuOpenChange={() => {}}
        onMerge={() => {}}
        onUnmerge={() => {}}
        onNavigate={() => {}}
        onPreview={() => {}}
        onPrint={() => {}}
        isPrinting={false}
      />
    );

    expect(screen.getByText("Take away")).toBeInTheDocument();
  });
});
