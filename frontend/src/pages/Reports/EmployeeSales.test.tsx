import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { EmployeeSales } from "./EmployeeSales";

vi.mock("../../context/BranchContext", () => ({
  useBranchContext: () => ({ activeBranchId: "Kozhikode" }),
}));

vi.mock("@ury/core", () => ({
  call: vi.fn(),
  formatCurrency: (val) => (val ?? 0).toString(),
}));

vi.mock("../../components/reports/charts/BarChartCard", () => ({
  BarChartCard: ({ title }) => <div>{title}</div>,
}));

import { call } from "@ury/core";

describe("EmployeeSales", () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(call).mockClear();
  });

  it("renders page title", () => {
    vi.mocked(call).mockResolvedValue({
      message: { employees: [], summary: { total_employees: 0, period_total_invoices: 0, period_total_sales: 0 } }
    });
    render(<EmployeeSales />);
    expect(screen.getByText("Employee Sales")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    vi.mocked(call).mockReturnValue(new Promise(() => {}));
    render(<EmployeeSales />);
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it("displays employee leaderboard", async () => {
    vi.mocked(call).mockResolvedValue({
      message: {
        employees: [{
          rank: 1, employee_id: "EMP-001", employee_name: "Alice",
          total_invoices: 50, sales_amount: 25000, net_sales_amount: 22000, average_invoice_value: 500
        }],
        summary: { total_employees: 1, period_total_invoices: 50, period_total_sales: 25000 }
      }
    });
    render(<EmployeeSales />);
    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });
  });

  it("handles API errors", async () => {
    vi.mocked(call).mockRejectedValueOnce(new Error("Data load error"));
    render(<EmployeeSales />);
    await waitFor(() => {
      expect(screen.getByText("Data load error")).toBeInTheDocument();
    });
  });

  it("renders without crashing on empty employees", async () => {
    vi.mocked(call).mockResolvedValue({
      message: { employees: [], summary: { total_employees: 0, period_total_invoices: 0, period_total_sales: 0 } }
    });
    render(<EmployeeSales />);
    await waitFor(() => {
      expect(screen.getByText("Employee Sales")).toBeInTheDocument();
    });
  });
});
