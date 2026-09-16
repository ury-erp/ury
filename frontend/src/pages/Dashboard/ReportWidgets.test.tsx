import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ReportWidgets from "./ReportWidgets";
import { TransactionRecord } from "../../services/dashboard";

vi.mock("../../context/BranchContext", () => ({
  useBranchContext: () => ({
    activeBranchId: "Kozhikode",
    activeBranch: { name: "Kozhikode Branch" },
  }),
}));

vi.mock("@ury/core", () => ({
  formatCurrency: (amount: number) => `Rs. ${amount.toFixed(2)}`,
}));

const mockTransactions: TransactionRecord[] = [
  {
    name: "INV-0001",
    customer: "John Doe",
    restaurant_table: "T-05",
    order_type: "Dine In",
    posting_date: "2026-09-09",
    posting_time: "12:30",
    status: "Paid",
    grand_total: 450,
  },
];

describe("ReportWidgets", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders the transactions table when data is loaded", () => {
    render(<ReportWidgets recentTransactions={mockTransactions} loading={false} />);
    expect(screen.getByText("Live POS Transactions")).toBeInTheDocument();
    expect(screen.getByText("INV-0001")).toBeInTheDocument();
  });

  it("shows loading spinner while loading", () => {
    render(<ReportWidgets recentTransactions={[]} loading={true} />);
    expect(screen.queryByText("INV-0001")).not.toBeInTheDocument();
  });

  it("shows empty message when no transactions", () => {
    render(<ReportWidgets recentTransactions={[]} loading={false} />);
    expect(screen.getByText("No transactions recorded yet today.")).toBeInTheDocument();
  });

  it("displays transaction status badges", () => {
    render(<ReportWidgets recentTransactions={mockTransactions} loading={false} />);
    expect(screen.getByText("Paid")).toBeInTheDocument();
  });

  it("handles walk-in customers gracefully", () => {
    const walkInTransaction: TransactionRecord = {
      name: "INV-0003",
      customer: "",
      restaurant_table: "T-01",
      order_type: "Dine In",
      posting_date: "2026-09-09",
      posting_time: "14:00",
      status: "Paid",
      grand_total: 500,
    };
    render(<ReportWidgets recentTransactions={[walkInTransaction]} loading={false} />);
    expect(screen.getByText("Walk-in Customer")).toBeInTheDocument();
  });
});
