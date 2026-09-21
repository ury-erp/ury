import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TableCard from "./TableCard";
import type { Table } from "../lib/table-api";

vi.mock("../i18n", () => ({
  t: (key: string, params?: any) => {
    if (key === "tables.merged_with_list" && params) return `Merged: $${params.tables}`;
    return key;
  },
}));

vi.mock("./TableActionsMenu", () => ({
  default: () => <div data-testid="table-actions-menu">Menu</div>,
}));

vi.mock("./TableShapeIcon", () => ({
  TableShapeIcon: ({ shape }: { shape: string }) => <div data-testid="table-shape">${shape}</div>,
}));

vi.mock("@ury/core", () => ({
  formatInvoiceTime: (time: string) => time,
}));

const mockTable: Table = {
  name: "Table-01",
  restaurant_room: "Main Hall",
  occupied: 0,
  no_of_seats: 4,
  table_shape: "Rectangle",
  is_take_away: 0,
  latest_invoice_time: null,
} as any;

const mockOccupiedTable: Table = {
  ...mockTable,
  occupied: 1,
  latest_invoice_time: "2026-09-09 14:30:00",
};

const defaultProps = {
  table: mockTable,
  menuOpen: false,
  onMenuOpenChange: vi.fn(),
  onMerge: vi.fn(),
  onUnmerge: vi.fn(),
  onNavigate: vi.fn(),
  onPreview: vi.fn(),
  onPrint: vi.fn(),
  isPrinting: false,
};

describe("TableCard", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders table name", () => {
    render(<TableCard {...defaultProps} />);
    expect(screen.getByText("Table-01")).toBeInTheDocument();
  });

  it("renders available badge for free table", () => {
    render(<TableCard {...defaultProps} />);
    expect(screen.getByText("tables.available")).toBeInTheDocument();
  });

  it("renders occupied badge for occupied table", () => {
    render(<TableCard {...defaultProps} table={mockOccupiedTable} />);
    expect(screen.getByText("tables.occupied")).toBeInTheDocument();
  });

  it("renders room information", () => {
    render(<TableCard {...defaultProps} />);
    expect(screen.getByText("tables.room")).toBeInTheDocument();
    expect(screen.getByText("Main Hall")).toBeInTheDocument();
  });

  it("renders seat count", () => {
    render(<TableCard {...defaultProps} table={mockOccupiedTable} />);
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("renders preview and print buttons for occupied tables", () => {
    render(<TableCard {...defaultProps} table={mockOccupiedTable} />);
    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByText("Print")).toBeInTheDocument();
  });

  it("does not render preview/print buttons for free tables", () => {
    render(<TableCard {...defaultProps} />);
    expect(screen.queryByText("Preview")).not.toBeInTheDocument();
    expect(screen.queryByText("Print")).not.toBeInTheDocument();
  });

  it("calls onNavigate when clicking free table", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<TableCard {...defaultProps} onNavigate={onNavigate} />);
    const tableElement = screen.getByRole("button");
    await user.click(tableElement);
    expect(onNavigate).toHaveBeenCalled();
  });

  it("calls onPreview when clicking preview button", async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn();
    render(<TableCard {...defaultProps} table={mockOccupiedTable} onPreview={onPreview} />);
    const previewButton = screen.getByText("Preview");
    await user.click(previewButton);
    expect(onPreview).toHaveBeenCalled();
  });

  it("calls onPrint when clicking print button", async () => {
    const user = userEvent.setup();
    const onPrint = vi.fn();
    render(<TableCard {...defaultProps} table={mockOccupiedTable} onPrint={onPrint} />);
    const printButton = screen.getByText("Print");
    await user.click(printButton);
    expect(onPrint).toHaveBeenCalled();
  });

  it("disables print button when printing", () => {
    render(<TableCard {...defaultProps} table={mockOccupiedTable} isPrinting={true} />);
    const printButton = screen.getByRole("button", { name: /Printing/i });
    expect(printButton).toBeDisabled();
  });
});
