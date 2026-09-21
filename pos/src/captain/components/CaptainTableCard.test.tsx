import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CaptainTableCard from "./CaptainTableCard";

vi.mock("@ury/ui", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
  Badge: ({ children }: any) => <span>{children}</span>,
}));

vi.mock("@ury/core", () => ({
  formatCurrency: (amount: number) => `Rs. ${amount}`,
}));

describe("CaptainTableCard", () => {
  const mockTable = { name: "T1", occupied: 0, latest_invoice_time: null, is_take_away: 0, restaurant_room: "Main", table_shape: "Rectangle", no_of_seats: 4 };

  it("renders table name", () => {
    render(<CaptainTableCard table={mockTable} ownership="free" onTap={vi.fn()} />);
    expect(screen.getByText("T1")).toBeInTheDocument();
  });

  it("renders free badge", () => {
    render(<CaptainTableCard table={mockTable} ownership="free" onTap={vi.fn()} />);
    expect(screen.getByText("Free")).toBeInTheDocument();
  });

  it("renders mine badge", () => {
    render(<CaptainTableCard table={mockTable} ownership="mine" onTap={vi.fn()} />);
    expect(screen.getByText("Mine")).toBeInTheDocument();
  });

  it("calls onTap when clicked", async () => {
    const onTap = vi.fn();
    render(<CaptainTableCard table={mockTable} ownership="free" onTap={onTap} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onTap).toHaveBeenCalled();
  });

  it("renders owner name when provided", () => {
    const occupied = { ...mockTable, occupied: 1 };
    render(<CaptainTableCard table={occupied} ownership="other" ownerName="John" onTap={vi.fn()} />);
    const johnElements = screen.queryAllByText("John");
    expect(johnElements.length).toBeGreaterThan(0);
  });

  it("renders billed badge", () => {
    render(
      <CaptainTableCard
        table={mockTable}
        order={{ grandTotal: 1000, invoicePrinted: true, name: "INV-001" }}
        ownership="free"
        onTap={vi.fn()}
      />
    );
    expect(screen.getByText("Billed")).toBeInTheDocument();
  });

  it("shows seat count", () => {
    render(<CaptainTableCard table={mockTable} ownership="free" onTap={vi.fn()} />);
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("shows grandTotal", () => {
    render(
      <CaptainTableCard
        table={{ ...mockTable, occupied: 1 }}
        order={{ grandTotal: 1500, invoicePrinted: false, name: "INV" }}
        ownership="mine"
        onTap={vi.fn()}
      />
    );
    expect(screen.getByText(/Rs\./)).toBeInTheDocument();
  });
});
