import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { ServiceWiseSales } from "./ServiceWiseSales";

vi.mock("../../context/BranchContext", () => ({
  useBranchContext: () => ({ activeBranchId: "Kozhikode" }),
}));

vi.mock("@ury/core", () => ({
  call: vi.fn(),
  formatCurrency: (val) => (val ?? 0).toString(),
}));

vi.mock("../../components/reports/charts/PieChartCard", () => ({
  PieChartCard: ({ title }) => <div>{title}</div>,
}));

import { call } from "@ury/core";

describe("ServiceWiseSales", () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(call).mockClear();
  });

  it("renders page title", () => {
    vi.mocked(call).mockResolvedValue({
      message: { by_service_type: [], summary: { total_revenue: 0, total_orders: 0, avg_order_value: 0 } }
    });
    render(<ServiceWiseSales />);
    expect(screen.getByText("Service Wise Sales")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    vi.mocked(call).mockReturnValue(new Promise(() => {}));
    render(<ServiceWiseSales />);
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it("displays service types when data loads", async () => {
    vi.mocked(call).mockResolvedValue({
      message: {
        by_service_type: [{
          order_type: "Dine-in", revenue: 20000, order_count: 100,
          avg_order_value: 200, percentage_of_total: 60
        }],
        summary: { total_revenue: 30000, total_orders: 150, avg_order_value: 200 }
      }
    });
    render(<ServiceWiseSales />);
    await waitFor(() => {
      expect(screen.getByText("Dine-in")).toBeInTheDocument();
    });
  });

  it("handles API errors", async () => {
    vi.mocked(call).mockRejectedValueOnce(new Error("Service error"));
    render(<ServiceWiseSales />);
    await waitFor(() => {
      expect(screen.getByText("Service error")).toBeInTheDocument();
    });
  });

  it("renders without crashing on empty data", async () => {
    vi.mocked(call).mockResolvedValue({
      message: { by_service_type: [], summary: {} }
    });
    render(<ServiceWiseSales />);
    await waitFor(() => {
      expect(screen.getByText("Service Wise Sales")).toBeInTheDocument();
    });
  });
});
