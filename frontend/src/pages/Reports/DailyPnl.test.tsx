import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { DailyPnl } from "./DailyPnl";

vi.mock("../../context/BranchContext", () => ({
  useBranchContext: () => ({
    activeBranchId: "Kozhikode",
    branches: [{ id: "Kozhikode", name: "Kozhikode" }],
  }),
}));

vi.mock("@ury/core", () => ({
  call: vi.fn(),
  formatCurrency: (val) => (val ?? 0).toString(),
}));

import { call } from "@ury/core";

describe("DailyPnl", () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(call).mockClear();
    // Set up default mock - return empty data for unknown calls
    vi.mocked(call).mockResolvedValue({ message: [] });
  });

  it("renders page title", () => {
    render(<DailyPnl />);
    expect(screen.getByText("Daily P&L")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    vi.mocked(call).mockReturnValue(new Promise(() => {}));
    render(<DailyPnl />);
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it("displays P&L summary when exists", async () => {
    // Mock both API calls
    vi.mocked(call).mockImplementation(async (endpoint: string) => {
      if (typeof endpoint === 'string' && endpoint.includes('get_daily_pnl_dates')) {
        return { message: ["2026-09-09"] };
      }
      // Return P&L data for any other call
      return {
        message: {
          exists: true,
          branch: "Kozhikode",
          date: "2026-09-09",
          summary: [
            { key: "revenue", label: "Revenue", amount: 50000, percent: 100 },
            { key: "cogs", label: "Cost of Goods", amount: 15000, percent: 30 }
          ],
          cost_of_goods: [],
          direct_expenses_breakup: [],
          employee_costs_breakup: [],
          indirect_expenses_breakup: []
        }
      };
    });

    render(<DailyPnl />);

    // Wait for the component to finish loading and render data
    await waitFor(() => {
      // Check for any evidence that data was fetched and rendered
      const allText = screen.queryAllByText(/Revenue|Cost/);
      expect(allText.length).toBeGreaterThan(0);
    }, { timeout: 8000 });
  });

  it("handles errors", async () => {
    let callCount = 0;
    vi.mocked(call).mockImplementation(async (endpoint: string) => {
      callCount++;
      if (typeof endpoint === 'string' && endpoint.includes('get_daily_pnl_dates')) {
        return { message: ["2026-09-09"] };
      }
      // Throw error on second call (the actual data fetch)
      if (callCount > 1) {
        throw new Error("Load failed");
      }
      return { message: [] };
    });

    render(<DailyPnl />);
    await waitFor(() => {
      expect(screen.getByText("Load failed")).toBeInTheDocument();
    }, { timeout: 8000 });
  });

  it("renders without crashing when P&L does not exist", async () => {
    vi.mocked(call).mockResolvedValue({
      message: { exists: false, branch: "Kozhikode", date: "2026-09-09" }
    });
    render(<DailyPnl />);
    await waitFor(() => {
      expect(screen.getByText("Daily P&L")).toBeInTheDocument();
    });
  });
});
