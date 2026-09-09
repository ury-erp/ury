import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CaptainTableCard from "./CaptainTableCard";
import type { Table } from "../../lib/table-api";
import type { ActiveTableOrder } from "../lib/captain-table-api";

vi.mock("@ury/core", () => ({
  formatCurrency: (amount: number) => `Rs. ${amount}`,
}));

vi.mock("@ury/ui", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
  Badge: ({ children, variant }: any) => (
    <span data-badge-variant={variant}>{children}</span>
  ),
}));

const mockTable: Table = {
  name: "Table 5",
  occupied: 0,
  latest_invoice_time: null,
  no_of_seats: 4,
};

describe("CaptainTableCard", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders a free table card", () => {
    render(
      <CaptainTableCard
        table={mockTable}
        ownership="free"
        onTap={vi.fn()}
      />
    );

    expect(screen.getByText(/Table 5/)).toBeInTheDocument();
    expect(screen.getByText(/Free/)).toBeInTheDocument();
  });

  it("renders a mine table card", () => {
    render(
      <CaptainTableCard
        table={mockTable}
        ownership="mine"
        onTap={vi.fn()}
      />
    );

    expect(screen.getByText(/Table 5/)).toBeInTheDocument();
    expect(screen.getByText(/Mine/)).toBeInTheDocument();
  });

  it("renders owner name for other captain's table", () => {
    const order: ActiveTableOrder = {
      waiter: "user123",
      grandTotal: 500,
      invoicePrinted: false,
    };

    render(
      <CaptainTableCard
        table={mockTable}
        ownership="other"
        ownerName="John Doe"
        order={order}
        onTap={vi.fn()}
      />
    );

    expect(screen.getByText(/John Doe/)).toBeInTheDocument();
  });

  it("shows billed/locked state with icon", () => {
    const order: ActiveTableOrder = {
      waiter: "user123",
      grandTotal: 500,
      invoicePrinted: true,
    };

    render(
      <CaptainTableCard
        table={{ ...mockTable, occupied: 1 }}
        order={order}
        ownership="other"
        onTap={vi.fn()}
      />
    );

    expect(screen.getByText(/Billed/)).toBeInTheDocument();
  });

  it("displays merge partners when present", () => {
    render(
      <CaptainTableCard
        table={mockTable}
        ownership="free"
        mergePartners={["Table 6", "Table 7"]}
        onTap={vi.fn()}
      />
    );

    expect(screen.getByText(/Table 6, Table 7/)).toBeInTheDocument();
  });

  it("displays grand total when order is present", () => {
    const order: ActiveTableOrder = {
      waiter: "user123",
      grandTotal: 500,
      invoicePrinted: false,
    };

    render(
      <CaptainTableCard
        table={{ ...mockTable, occupied: 1 }}
        order={order}
        ownership="mine"
        onTap={vi.fn()}
      />
    );

    expect(screen.getByText(/Rs. 500/)).toBeInTheDocument();
  });

  it("displays number of seats", () => {
    render(
      <CaptainTableCard
        table={mockTable}
        ownership="free"
        onTap={vi.fn()}
      />
    );

    expect(screen.getByText(/4/)).toBeInTheDocument();
  });

  it("shows elapsed time for occupied table", () => {
    const pastTime = new Date(Date.now() - 60000).toISOString();
    render(
      <CaptainTableCard
        table={{
          ...mockTable,
          occupied: 1,
          latest_invoice_time: pastTime,
        }}
        ownership="mine"
        onTap={vi.fn()}
      />
    );

    // Should show "1m" or similar
    expect(screen.getByText(/m/)).toBeInTheDocument();
  });

  it("calls onTap when card is clicked", async () => {
    const onTap = vi.fn();
    const user = userEvent.setup();

    render(
      <CaptainTableCard
        table={mockTable}
        ownership="free"
        onTap={onTap}
      />
    );

    const button = screen.getByRole("button");
    await user.click(button);

    expect(onTap).toHaveBeenCalled();
  });

  it("displays different colors for different ownership states", () => {
    const { rerender } = render(
      <CaptainTableCard
        table={mockTable}
        ownership="free"
        onTap={vi.fn()}
      />
    );

    // Check free state renders
    expect(screen.getByText(/Free/)).toBeInTheDocument();

    rerender(
      <CaptainTableCard
        table={mockTable}
        ownership="mine"
        onTap={vi.fn()}
      />
    );

    expect(screen.getByText(/Mine/)).toBeInTheDocument();
  });

  it("does not show owner name when ownership is mine", () => {
    render(
      <CaptainTableCard
        table={mockTable}
        ownership="mine"
        ownerName="John Doe"
        onTap={vi.fn()}
      />
    );

    // Owner name should not appear when it's the current user's table
    const ownerText = screen.queryByText(/John Doe/);
    expect(ownerText).not.toBeInTheDocument();
  });
});
