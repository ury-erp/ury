import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { AverageBillValue } from "./AverageBillValue";

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

describe("AverageBillValue", () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(call).mockClear();
  });

  it("renders page title", () => {
    vi.mocked(call).mockResolvedValue({
      message: { data: [], summary: { total_bills: 0, total_sales: 0, average_abv: 0 } }
    });
    render(<AverageBillValue />);
    expect(screen.getByText("Average Bill Value")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    vi.mocked(call).mockReturnValue(new Promise(() => {}));
    render(<AverageBillValue />);
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it("displays ABV trend data", async () => {
    vi.mocked(call).mockResolvedValue({
      message: {
        data: [{
          date: "2026-09-01", bill_count: 45, total_sales: 11800, abv: 262
        }],
        summary: { total_bills: 45, total_sales: 11800, average_abv: 262 }
      }
    });
    render(<AverageBillValue />);
    await waitFor(() => {
      expect(screen.getByText("2026-09-01")).toBeInTheDocument();
    });
  });

  it("handles errors", async () => {
    vi.mocked(call).mockRejectedValueOnce(new Error("ABV data error"));
    render(<AverageBillValue />);
    await waitFor(() => {
      expect(screen.getByText("ABV data error")).toBeInTheDocument();
    });
  });

  it("renders without crashing on empty data", async () => {
    vi.mocked(call).mockResolvedValue({
      message: { data: [], summary: {} }
    });
    render(<AverageBillValue />);
    await waitFor(() => {
      expect(screen.getByText("Average Bill Value")).toBeInTheDocument();
    });
  });
});
