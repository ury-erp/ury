import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TableLayoutView from "./TableLayoutView";

vi.mock("@ury/core", () => ({
  formatInvoiceTime: (time: string) => new Date(time).toLocaleString(),
  call: vi.fn(),
}));

const mockTables = [
  { name: "T-01", room: "Main", capacity: 4, no_of_seats: 4, table_shape: "Square", layout_x: 60, layout_y: 60, occupied: 0 },
  { name: "T-02", room: "Main", capacity: 2, no_of_seats: 2, table_shape: "Circle", layout_x: 200, layout_y: 60, occupied: 1 },
];

describe("TableLayoutView", () => {
  beforeEach(() => cleanup());

  it("renders table layout", () => {
    render(<TableLayoutView selectedRoom="Main" tables={mockTables} onBackToGrid={vi.fn()} />);
    expect(screen.getByText("T-01")).toBeInTheDocument();
  });

  it("displays all tables", () => {
    render(<TableLayoutView selectedRoom="Main" tables={mockTables} onBackToGrid={vi.fn()} />);
    expect(screen.getByText("T-02")).toBeInTheDocument();
  });

  it("shows edit button", () => {
    render(<TableLayoutView selectedRoom="Main" tables={mockTables} onBackToGrid={vi.fn()} />);
    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
  });

  it("shows zoom controls", () => {
    render(<TableLayoutView selectedRoom="Main" tables={mockTables} onBackToGrid={vi.fn()} />);
    expect(screen.getByTitle("Zoom In")).toBeInTheDocument();
  });

  it("displays zoom percentage", () => {
    render(<TableLayoutView selectedRoom="Main" tables={mockTables} onBackToGrid={vi.fn()} />);
    expect(screen.getByText(/100%/)).toBeInTheDocument();
  });

  it("toggles edit mode", async () => {
    const user = userEvent.setup();
    render(<TableLayoutView selectedRoom="Main" tables={mockTables} onBackToGrid={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByRole("button", { name: /finish/i })).toBeInTheDocument();
  });

  it("opens properties on click", async () => {
    const user = userEvent.setup();
    render(<TableLayoutView selectedRoom="Main" tables={mockTables} onBackToGrid={vi.fn()} />);
    await user.click(screen.getByText("T-01"));
    expect(screen.getByText(/table info|edit settings/i)).toBeInTheDocument();
  });

  it("renders empty layout", () => {
    render(<TableLayoutView selectedRoom="Main" tables={[]} onBackToGrid={vi.fn()} />);
    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
  });

  it("shows zoom out button", () => {
    render(<TableLayoutView selectedRoom="Main" tables={mockTables} onBackToGrid={vi.fn()} />);
    expect(screen.getByTitle("Zoom Out")).toBeInTheDocument();
  });

  it("shows reset zoom button", () => {
    render(<TableLayoutView selectedRoom="Main" tables={mockTables} onBackToGrid={vi.fn()} />);
    expect(screen.getByTitle("Reset Zoom & Pan")).toBeInTheDocument();
  });

  it("shows all tables", () => {
    render(<TableLayoutView selectedRoom="Main" tables={mockTables} onBackToGrid={vi.fn()} />);
    expect(screen.getByText("T-01")).toBeInTheDocument();
    expect(screen.getByText("T-02")).toBeInTheDocument();
  });
});
