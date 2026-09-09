import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { TimeWiseSales } from "./TimeWiseSales";

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

describe("TimeWiseSales", () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(call).mockClear();
  });

  it("renders page title", () => {
    vi.mocked(call).mockResolvedValue({
      message: { intervals: [], summary: {} }
    });
    render(<TimeWiseSales />);
    expect(screen.getByText("Time Wise Sales")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    vi.mocked(call).mockReturnValue(new Promise(() => {}));
    render(<TimeWiseSales />);
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it("displays time intervals when data loads", async () => {
    vi.mocked(call).mockResolvedValue({
      message: {
        branch: "Kozhikode", date: "2026-09-09", bucket_size_hours: 2,
        intervals: [{
          interval_label: "10:00-12:00", start_hour: 10, end_hour: 12,
          sales: 5000, bills: 25, pct_of_daily_total: 20, avg_transaction_value: 200
        }],
        summary: { total_sales: 25000, total_bills: 100, avg_sale_per_bill: 250, peak_interval: "10:00-12:00", peak_interval_sales: 5000 }
      }
    });
    render(<TimeWiseSales />);
    await waitFor(() => {
      const intervals = screen.getAllByText("10:00-12:00");
      expect(intervals.length).toBeGreaterThan(0);
    });
  });

  it("handles errors on API failure", async () => {
    vi.mocked(call).mockRejectedValueOnce(new Error("Time data error"));
    render(<TimeWiseSales />);
    await waitFor(() => {
      expect(screen.getByText("Time data error")).toBeInTheDocument();
    });
  });

  it("renders without crashing on empty data", async () => {
    vi.mocked(call).mockResolvedValue({ message: { intervals: [], summary: {} } });
    render(<TimeWiseSales />);
    await waitFor(() => {
      expect(screen.getByText("Time Wise Sales")).toBeInTheDocument();
    });
  });
});
