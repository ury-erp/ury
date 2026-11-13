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

  it("renders complete long table and room names with wrapping", () => {
    const longTableName = "Table-With-A-Very-Long-Name-That-Must-Wrap-Without-Truncation";
    const longRoomName = "Shawaya Hub - Malappuram Private Dining Room With A Very Long Name";
    render(
      <TableCard
        table={{ ...mockTable, name: longTableName, restaurant_room: longRoomName }}
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

    const tableName = screen.getByText(longTableName);
    const roomName = screen.getByText(longRoomName);
    expect(tableName).toHaveClass("whitespace-normal", "break-words");
    expect(tableName).not.toHaveClass("truncate");
    expect(roomName).toHaveClass("whitespace-normal", "break-words");
    expect(roomName).not.toHaveClass("truncate");
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

    expect(screen.getByText("pos_ui.preview")).toBeInTheDocument();
    expect(screen.getByText("pos_ui.print")).toBeInTheDocument();
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

    expect(screen.queryByText("pos_ui.preview")).not.toBeInTheDocument();
    expect(screen.queryByText("pos_ui.print")).not.toBeInTheDocument();
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

  it("renders merged status and complete merge group label when provided", () => {
    const mergeGroupLabel = "Table-1, Table-2, Table-With-An-Exceptionally-Long-Merged-Name";
    render(
      <TableCard
        table={mockTable}
        mergeGroupLabel={mergeGroupLabel}
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

    expect(screen.getByText("tables.merged")).toBeInTheDocument();
    expect(screen.queryByText("tables.available")).not.toBeInTheDocument();
    const mergedLabel = screen.getByText(`Merged with ${mergeGroupLabel}`);
    expect(mergedLabel).toHaveClass("whitespace-normal", "break-words");
    expect(mergedLabel).not.toHaveClass("truncate");
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

    expect(screen.getByText("pos_ui.printing")).toBeInTheDocument();
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

    const takeawayBadge = screen.getByText("pos_ui.take_away");
    const informationRows = screen.getByText("tables.room").parentElement?.parentElement;
    expect(takeawayBadge).toBeInTheDocument();
    expect(informationRows).not.toContainElement(takeawayBadge);
    expect(informationRows?.nextElementSibling).toBe(takeawayBadge);
    expect(takeawayBadge).toHaveClass("mt-3", "self-start");
  });
});
