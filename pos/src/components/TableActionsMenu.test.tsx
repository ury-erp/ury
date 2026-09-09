import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import TableActionsMenu from "./TableActionsMenu";
import type { Table } from "../lib/table-api";

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

vi.mock("../lib/table-utils", () => ({
  isMergedTable: (table: Table) => table.name.includes("merged"),
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

describe("TableActionsMenu", () => {
  it("renders the menu button", () => {
    render(
      <TableActionsMenu
        table={mockTable}
        isOpen={false}
        onOpenChange={() => {}}
        onMerge={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: /tables.table_actions/i })).toBeInTheDocument();
  });

  it("opens and closes the menu on button click", async () => {
    const handleOpenChange = vi.fn();
    const { rerender } = render(
      <TableActionsMenu
        table={mockTable}
        isOpen={false}
        onOpenChange={handleOpenChange}
        onMerge={() => {}}
      />
    );

    const button = screen.getByRole("button", { name: /tables.table_actions/i });
    await userEvent.click(button);

    expect(handleOpenChange).toHaveBeenCalledWith(true);

    rerender(
      <TableActionsMenu
        table={mockTable}
        isOpen={true}
        onOpenChange={handleOpenChange}
        onMerge={() => {}}
      />
    );

    await userEvent.click(button);
    expect(handleOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows merge option for available table", async () => {
    const handleOpenChange = vi.fn();
    const handleMerge = vi.fn();
    render(
      <TableActionsMenu
        table={mockTable}
        isOpen={true}
        onOpenChange={handleOpenChange}
        onMerge={handleMerge}
      />
    );

    expect(screen.getByText(/tables.merge_tables/i)).toBeInTheDocument();
  });

  it("does not show unmerge for available table", () => {
    render(
      <TableActionsMenu
        table={mockTable}
        isOpen={true}
        onOpenChange={() => {}}
        onUnmerge={() => {}}
      />
    );

    expect(screen.queryByText(/tables.unmerge_tables/i)).not.toBeInTheDocument();
  });

  it("shows merge and transfer options for occupied table", () => {
    const occupiedTable = { ...mockTable, occupied: 1 };
    render(
      <TableActionsMenu
        table={occupiedTable}
        isOpen={true}
        onOpenChange={() => {}}
        onMerge={() => {}}
        onTransferTable={() => {}}
      />
    );

    expect(screen.getByText(/tables.merge_tables/i)).toBeInTheDocument();
    expect(screen.getByText(/tables.transfer_table/i)).toBeInTheDocument();
  });

  it("calls onMerge when merge button is clicked", async () => {
    const handleMerge = vi.fn();
    render(
      <TableActionsMenu
        table={mockTable}
        isOpen={true}
        onOpenChange={() => {}}
        onMerge={handleMerge}
      />
    );

    const mergeButton = screen.getByText(/tables.merge_tables/i);
    await userEvent.click(mergeButton);

    expect(handleMerge).toHaveBeenCalledTimes(1);
  });

  it("closes menu after merge action", async () => {
    const handleOpenChange = vi.fn();
    render(
      <TableActionsMenu
        table={mockTable}
        isOpen={true}
        onOpenChange={handleOpenChange}
        onMerge={() => {}}
      />
    );

    await userEvent.click(screen.getByText(/tables.merge_tables/i));
    expect(handleOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows captain transfer option when enabled and provided", () => {
    const occupiedTable = { ...mockTable, occupied: 1 };
    render(
      <TableActionsMenu
        table={occupiedTable}
        isOpen={true}
        onOpenChange={() => {}}
        onMerge={() => {}}
        onTransferCaptain={() => {}}
        showCaptainTransfer={true}
      />
    );

    expect(screen.getByText(/tables.transfer_captain/i)).toBeInTheDocument();
  });
});
