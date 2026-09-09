import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { DaywiseSales } from "./DaywiseSales";

vi.mock("../../context/BranchContext", () => ({
  useBranchContext: () => ({ activeBranchId: "Kozhikode" }),
}));

vi.mock("@ury/core", () => ({
  call: vi.fn(),
  formatCurrency: (val) => (val ?? 0).toString(),
}));

vi.mock("../../components/reports/charts/LineChartCard", () => ({
  LineChartCard: ({ title }) => <div>{title}</div>,
}));

import { call } from "@ury/core";

describe("DaywiseSales", () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(call).mockClear();
  });

  it("renders page title", () => {
    vi.mocked(call).mockResolvedValue({
      message: { rows: [], summary: {} }
    });
    render(<DaywiseSales />);
    expect(screen.getByText("Daywise Sales")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    vi.mocked(call).mockReturnValue(new Promise(() => {}));
    render(<DaywiseSales />);
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it("displays daily sales trend", async () => {
    vi.mocked(call).mockResolvedValue({
      message: {
        branch: "Kozhikode", start_date: "2026-09-01", end_date: "2026-09-09",
        rows: [{
          date: "2026-09-01", total_invoices: 45, item_total: 10000,
          total_taxes: 1800, grand_total: 11800, round_off: 0, cash_discount: -100
        }],
        summary: { period_total: 11800, peak_day: "2026-09-01", peak_day_total: 11800, period_avg_daily: 11800, total_invoices: 45 }
      }
    });
    render(<DaywiseSales />);
    await waitFor(() => {
      const dates = screen.getAllByText("2026-09-01");
      expect(dates.length).toBeGreaterThan(0);
    });
  });

  it("handles errors", async () => {
    vi.mocked(call).mockRejectedValueOnce(new Error("Daily sales error"));
    render(<DaywiseSales />);
    await waitFor(() => {
      expect(screen.getByText("Daily sales error")).toBeInTheDocument();
    });
  });

  it("renders without crashing on empty rows", async () => {
    vi.mocked(call).mockResolvedValue({
      message: { rows: [], summary: {} }
    });
    render(<DaywiseSales />);
    await waitFor(() => {
      expect(screen.getByText("Daywise Sales")).toBeInTheDocument();
    });
  });
});
