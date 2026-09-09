import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmployeeCommission } from "./EmployeeCommission";

vi.mock("../../context/BranchContext", () => ({
  useBranchContext: () => ({ activeBranchId: "Kozhikode" }),
}));

const mockCall = vi.fn();
vi.mock("@ury/core", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    call: (...args) => mockCall(...args),
    formatCurrency: (amount) => "Rs. " + amount,
  };
});

describe("EmployeeCommission", () => {
  beforeEach(() => { cleanup(); mockCall.mockReset(); });

  it("renders header", async () => {
    mockCall.mockResolvedValue({
      message: {
        settings: { enabled: true, commission_base: "Sales", attribution_mode: "Direct", include_returns: false, tier_period: "Monthly", default_rate: 5, rules: [] },
        tier_period_partial: false,
        employees: [],
        unattributed: { invoices: 0, base: 0 },
        summary: { total_employees: 0, total_base: 0, total_commission: 0 },
      },
    });
    render(<EmployeeCommission />);
    expect(screen.getByText("Employee Commission")).toBeInTheDocument();
  });

  it("shows disabled state when commission disabled", async () => {
    mockCall.mockResolvedValue({
      message: {
        settings: { enabled: false, commission_base: "", attribution_mode: "", include_returns: false, tier_period: "", default_rate: 0, rules: [] },
        tier_period_partial: false,
        employees: [],
        unattributed: { invoices: 0, base: 0 },
        summary: { total_employees: 0, total_base: 0, total_commission: 0 },
      },
    });
    render(<EmployeeCommission />);
    await waitFor(() => {
      expect(screen.getByText("Commission Tracking is Not Enabled")).toBeInTheDocument();
    });
  });

  it("displays employee commission data", async () => {
    mockCall.mockResolvedValue({
      message: {
        settings: { enabled: true, commission_base: "Sales", attribution_mode: "Direct", include_returns: false, tier_period: "Monthly", default_rate: 5, rules: [] },
        tier_period_partial: false,
        employees: [
          { rank: 1, employee: "emp-001", employee_name: "John", designation: "Manager", attributed_invoices: 50, weighted_invoices: 50, attributed_base: 10000, effective_rate: 5, rate_source: "Tier", commission_amount: 500, periods: [] },
        ],
        unattributed: { invoices: 0, base: 0 },
        summary: { total_employees: 1, total_base: 10000, total_commission: 500 },
      },
    });
    render(<EmployeeCommission />);
    await waitFor(() => {
      expect(screen.getByText("John")).toBeInTheDocument();
    });
  });

  it("shows KPI strip", async () => {
    mockCall.mockResolvedValue({
      message: {
        settings: { enabled: true, commission_base: "Sales", attribution_mode: "Direct", include_returns: false, tier_period: "Monthly", default_rate: 5, rules: [] },
        tier_period_partial: false,
        employees: [],
        unattributed: { invoices: 0, base: 0 },
        summary: { total_employees: 5, total_base: 50000, total_commission: 2500 },
      },
    });
    render(<EmployeeCommission />);
    await waitFor(() => {
      expect(screen.getByText("Total Commission")).toBeInTheDocument();
      expect(screen.getByText("5")).toBeInTheDocument();
    });
  });

  it("shows unattributed warning", async () => {
    mockCall.mockResolvedValue({
      message: {
        settings: { enabled: true, commission_base: "Sales", attribution_mode: "Direct", include_returns: false, tier_period: "Monthly", default_rate: 5, rules: [] },
        tier_period_partial: false,
        employees: [],
        unattributed: { invoices: 10, base: 2000 },
        summary: { total_employees: 0, total_base: 0, total_commission: 0 },
      },
    });
    render(<EmployeeCommission />);
    await waitFor(() => {
      expect(screen.getByText(/10 invoices/)).toBeInTheDocument();
    });
  });
});
