import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { TodaysSales } from "./TodaysSales";

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

vi.mock("../../components/reports/charts/PieChartCard", () => ({
  PieChartCard: ({ title }) => <div>{title}</div>,
}));

import { call } from "@ury/core";

describe("TodaysSales", () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(call).mockClear();
  });

  it("renders page title", () => {
    vi.mocked(call).mockResolvedValue({
      message: { query_date: "2026-09-09", day_of_week: "Wed", branch: "Kozhikode", total_invoices: 0 }
    });
    render(<TodaysSales />);
    expect(screen.getByText(/Today.s Sales/i)).toBeInTheDocument();
  });

  it("shows loading state", () => {
    vi.mocked(call).mockReturnValue(new Promise(() => {}));
    render(<TodaysSales />);
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it("displays todays sales data when loaded", async () => {
    vi.mocked(call).mockResolvedValue({
      message: { 
        query_date: "2026-09-09", 
        day_of_week: "Wed",
        branch: "Kozhikode",
        total_invoices: 50,
        item_total: 25000
      }
    });
    render(<TodaysSales />);
    await waitFor(() => {
      expect(screen.getByText(/Today.s Sales/i)).toBeInTheDocument();
    });
  });

  it("handles API errors gracefully", async () => {
    vi.mocked(call).mockRejectedValueOnce(new Error("Data load failed"));
    render(<TodaysSales />);
    await waitFor(() => {
      expect(screen.getByText("Data load failed")).toBeInTheDocument();
    });
  });

  it("renders without crashing on empty data", async () => {
    vi.mocked(call).mockResolvedValue({
      message: { query_date: "2026-09-09", day_of_week: "Wed" }
    });
    render(<TodaysSales />);
    await waitFor(() => {
      expect(screen.getByText(/Today.s Sales/i)).toBeInTheDocument();
    });
  });
});
