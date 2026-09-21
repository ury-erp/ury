import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import TableTransferDialog from "./TableTransferDialog";
import type { Table } from "../lib/table-api";

vi.mock("../i18n", () => ({
  t: (key: string, params?: Record<string, any>) => {
    const translations: Record<string, string> = {
      "tables.transfer_table": "Transfer Table",
      "tables.select_destination_table": "Select a destination table",
      "tables.current_table": "Current Table",
      "tables.search_transfer_placeholder": "Search tables...",
      "common.loading": "Loading",
      "tables.no_destination_tables": "No destination tables available",
      "tables.seats": "seats",
      "tables.transfer_confirm": "Transfer",
      "common.cancel": "Cancel",
      "tables.transfer_failed": "Transfer failed",
    };
    if (key === "tables.select_destination_table" && params?.table) {
      return "Select a destination table";
    }
    return translations[key] || key;
  },
}));

vi.mock("./TableShapeIcon", () => ({
  TableShapeIcon: ({ shape }: { shape: string }) => <div>Icon-{shape}</div>,
}));

const mockTable = (name: string, room: string = "Main"): Table => ({
  name,
  table_shape: "Rectangle",
  restaurant_room: room,
  no_of_seats: 4,
});

describe("TableTransferDialog", () => {
  it("does not render when open is false", () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();

    render(
      <TableTransferDialog
        open={false}
        onOpenChange={onOpenChange}
        sourceTable={mockTable("Table-1")}
        destinationTables={[mockTable("Table-2")]}
        onConfirm={onConfirm}
      />
    );

    expect(screen.queryByText("Transfer Table")).not.toBeInTheDocument();
  });

  it("renders dialog with title when open", () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();

    render(
      <TableTransferDialog
        open={true}
        onOpenChange={onOpenChange}
        sourceTable={mockTable("Table-1")}
        destinationTables={[mockTable("Table-2")]}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText("Transfer Table")).toBeInTheDocument();
  });

  it("displays source table name", () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();

    render(
      <TableTransferDialog
        open={true}
        onOpenChange={onOpenChange}
        sourceTable={mockTable("Table-1")}
        destinationTables={[mockTable("Table-2")]}
        onConfirm={onConfirm}
      />
    );

    const input = screen.getByDisplayValue("Table-1");
    expect(input).toBeInTheDocument();
  });

  it("filters tables by search text", async () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <TableTransferDialog
        open={true}
        onOpenChange={onOpenChange}
        sourceTable={mockTable("Table-1")}
        destinationTables={[
          mockTable("Table-2"),
          mockTable("Table-3"),
        ]}
        onConfirm={onConfirm}
      />
    );

    const searchInput = screen.getByPlaceholderText("Search tables...");
    await user.type(searchInput, "Table-2");

    expect(screen.getByText("Table-2")).toBeInTheDocument();
  });

  it("shows empty message when no tables match search", async () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <TableTransferDialog
        open={true}
        onOpenChange={onOpenChange}
        sourceTable={mockTable("Table-1")}
        destinationTables={[mockTable("Table-2")]}
        onConfirm={onConfirm}
      />
    );

    const searchInput = screen.getByPlaceholderText("Search tables...");
    await user.type(searchInput, "NonExistent");

    expect(screen.getByText("No destination tables available")).toBeInTheDocument();
  });

  it("enables table selection and calls onConfirm when selected and submitted", async () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <TableTransferDialog
        open={true}
        onOpenChange={onOpenChange}
        sourceTable={mockTable("Table-1")}
        destinationTables={[mockTable("Table-2"), mockTable("Table-3")]}
        onConfirm={onConfirm}
      />
    );

    const table2Button = screen.getByText("Table-2");
    await user.click(table2Button);

    const transferButton = screen.getByText("Transfer");
    await user.click(transferButton);

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith("Table-2");
    });
  });

  it("disables submit button when no table is selected", () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();

    render(
      <TableTransferDialog
        open={true}
        onOpenChange={onOpenChange}
        sourceTable={mockTable("Table-1")}
        destinationTables={[mockTable("Table-2")]}
        onConfirm={onConfirm}
      />
    );

    const transferButton = screen.getByText("Transfer");
    expect(transferButton).toBeDisabled();
  });

  it("closes dialog when cancel button clicked", async () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <TableTransferDialog
        open={true}
        onOpenChange={onOpenChange}
        sourceTable={mockTable("Table-1")}
        destinationTables={[mockTable("Table-2")]}
        onConfirm={onConfirm}
      />
    );

    const cancelButton = screen.getByText("Cancel");
    await user.click(cancelButton);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("displays table seat count", () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();

    render(
      <TableTransferDialog
        open={true}
        onOpenChange={onOpenChange}
        sourceTable={mockTable("Table-1")}
        destinationTables={[{ ...mockTable("Table-2"), no_of_seats: 6 }]}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText("6 seats")).toBeInTheDocument();
  });

  it("handles error from onConfirm", async () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn().mockRejectedValueOnce(new Error("Transfer failed"));
    const user = userEvent.setup();

    render(
      <TableTransferDialog
        open={true}
        onOpenChange={onOpenChange}
        sourceTable={mockTable("Table-1")}
        destinationTables={[mockTable("Table-2")]}
        onConfirm={onConfirm}
      />
    );

    const table2Button = screen.getByText("Table-2");
    await user.click(table2Button);

    const transferButton = screen.getByText("Transfer");
    await user.click(transferButton);

    await waitFor(() => {
      expect(screen.getByText("Transfer failed")).toBeInTheDocument();
    });
  });
});
