import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MonthWiseSales } from "./MonthWiseSales";

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

describe("MonthWiseSales", () => {
  beforeEach(() => { cleanup(); mockCall.mockReset(); });

  it("renders header", async () => {
    mockCall.mockResolvedValue({
      message: {
        data: [],
        summary: { total_revenue: 0, average_monthly_revenue: 0, best_month: null, worst_month: null },
      },
    });
    render(<MonthWiseSales />);
    expect(screen.getByText("Month Wise Sales")).toBeInTheDocument();
  });

  it("displays KPI strip", async () => {
    mockCall.mockResolvedValue({
      message: {
        data: [],
        summary: { total_revenue: 50000, average_monthly_revenue: 8333, best_month: "September", worst_month: "July" },
      },
    });
    render(<MonthWiseSales />);
    await waitFor(() => {
      expect(screen.getByText("Total Revenue")).toBeInTheDocument();
      expect(screen.getByText("Best Month")).toBeInTheDocument();
    });
  });

  it("displays month data table", async () => {
    mockCall.mockResolvedValue({
      message: {
        data: [{ year: 2026, month_number: 9, month_name: "September", month: "Sep 2026", item_total: 10000, taxes: 500, grand_total: 10500, growth_percentage: 5 }],
        summary: { total_revenue: 10500, average_monthly_revenue: 10500, best_month: "September", worst_month: "September" },
      },
    });
    render(<MonthWiseSales />);
    await waitFor(() => {
      expect(screen.getByText("Sep 2026")).toBeInTheDocument();
    });
  });

  it("changes month range on select change", async () => {
    mockCall.mockResolvedValue({
      message: {
        data: [],
        summary: { total_revenue: 0, average_monthly_revenue: 0, best_month: null, worst_month: null },
      },
    });
    render(<MonthWiseSales />);
    const selects = screen.getAllByRole("combobox");
    const selectEl = selects[0];
    await userEvent.selectOptions(selectEl, "12");
    await waitFor(() => {
      expect(mockCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ months_back: 12 }));
    });
  });
});
