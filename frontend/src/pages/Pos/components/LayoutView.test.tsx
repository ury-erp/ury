import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LayoutView from "./LayoutView";
import type { Table } from "../lib/table-api";

vi.mock("../lib/table-api", () => ({
  updateTableLayout: vi.fn().mockResolvedValue({}),
}));

vi.mock("../lib/order-api", () => ({
  getTableOrder: vi.fn().mockResolvedValue({ message: {} }),
}));

vi.mock("../lib/invoice-api", () => ({
  getCombinedOrderTotals: () => ({ roundedTotal: 100 }),
}));

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

const mockTables: Table[] = [
  {
    name: "Table-01",
    restaurant_room: "Main Hall",
    occupied: 0,
    no_of_seats: 4,
    table_shape: "Rectangle",
    is_take_away: 0,
    latest_invoice_time: null,
    layout_x: 100,
    layout_y: 100,
  } as any,
  {
    name: "Table-02",
    restaurant_room: "Main Hall",
    occupied: 1,
    no_of_seats: 6,
    table_shape: "Round",
    is_take_away: 0,
    latest_invoice_time: "2026-09-09 14:00:00",
    layout_x: 250,
    layout_y: 100,
  } as any,
];

const defaultProps = {
  selectedRoom: "Main Hall",
  tables: mockTables,
  onBackToGrid: vi.fn(),
  onRefresh: vi.fn(),
};

describe("LayoutView", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders layout view header", () => {
    render(<LayoutView {...defaultProps} />);
    expect(screen.getByText(/Main Hall/)).toBeInTheDocument();
    expect(screen.getByText(/tables.layout/)).toBeInTheDocument();
  });

  it("renders grid view button", () => {
    render(<LayoutView {...defaultProps} />);
    expect(screen.getByRole("button", { name: /tables.grid_view/i })).toBeInTheDocument();
  });

  it("calls onBackToGrid when grid view button is clicked", async () => {
    const user = userEvent.setup();
    const onBackToGrid = vi.fn();

    render(<LayoutView {...defaultProps} onBackToGrid={onBackToGrid} />);

    const gridButton = screen.getByRole("button", { name: /tables.grid_view/i });
    await user.click(gridButton);

    expect(onBackToGrid).toHaveBeenCalled();
  });

  it("renders edit layout button", () => {
    render(<LayoutView {...defaultProps} />);
    expect(screen.getByRole("button", { name: /tables.edit_layout/i })).toBeInTheDocument();
  });

  it("renders zoom controls", () => {
    render(<LayoutView {...defaultProps} />);
    expect(screen.getByTitle("Zoom In")).toBeInTheDocument();
    expect(screen.getByTitle("Zoom Out")).toBeInTheDocument();
    expect(screen.getByTitle("Reset Zoom & Pan")).toBeInTheDocument();
  });

  it("renders all tables as elements", () => {
    render(<LayoutView {...defaultProps} />);
    expect(screen.getByText("Table-01")).toBeInTheDocument();
    expect(screen.getByText("Table-02")).toBeInTheDocument();
  });

  it("shows zoom percentage", () => {
    render(<LayoutView {...defaultProps} />);
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("toggles edit mode when edit button is clicked", async () => {
    const user = userEvent.setup();
    render(<LayoutView {...defaultProps} />);

    const editButton = screen.getByRole("button", { name: /tables.edit_layout/i });
    await user.click(editButton);

    expect(screen.getByRole("button", { name: /tables.finish_editing/i })).toBeInTheDocument();
  });

  it("selects table when clicked", async () => {
    const user = userEvent.setup();
    render(<LayoutView {...defaultProps} />);

    const table = screen.getByText("Table-01");
    await user.click(table);

    expect(screen.getByText("tables.table_info")).toBeInTheDocument();
  });

  it("shows table info panel when table is selected", async () => {
    const user = userEvent.setup();
    render(<LayoutView {...defaultProps} />);

    const table = screen.getByText("Table-01");
    await user.click(table);

    // Check for table name in info panel
    const inputs = screen.getAllByDisplayValue("Table-01");
    expect(inputs.length).toBeGreaterThan(0);
  });

  it("shows status in table info panel", async () => {
    const user = userEvent.setup();
    render(<LayoutView {...defaultProps} />);

    const table = screen.getByText("Table-01");
    await user.click(table);

    expect(screen.getByText("tables.available")).toBeInTheDocument();
  });

  it("closes table info panel when close button is clicked", async () => {
    const user = userEvent.setup();
    render(<LayoutView {...defaultProps} />);

    const table = screen.getByText("Table-01");
    await user.click(table);

    expect(screen.getByText("tables.table_info")).toBeInTheDocument();

    const closeButtons = screen.getAllByRole("button").filter((btn) => {
      const classNames = btn.className || "";
      return classNames.includes("h-7") && classNames.includes("w-7");
    });

    if (closeButtons.length > 0) {
      await user.click(closeButtons[0]);
      expect(screen.queryByText("tables.table_info")).not.toBeInTheDocument();
    }
  });
});
