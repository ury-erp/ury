import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { RepeatedCustomers } from "./RepeatedCustomers";

vi.mock("../../context/BranchContext", () => ({
  useBranchContext: () => ({ activeBranchId: "Kozhikode" }),
}));

const mockCall = vi.fn();
vi.mock("@ury/core", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    call: (...args) => mockCall(...args),
  };
});

describe("RepeatedCustomers", () => {
  beforeEach(() => { cleanup(); mockCall.mockReset(); });

  it("renders header", async () => {
    mockCall.mockResolvedValue({
      message: {
        rows: [],
        summary: { total_customers: 0, new_customers: 0, repeat_customers: 0, avg_repeat_rate_percent: 0 },
      },
    });
    render(<RepeatedCustomers />);
    expect(screen.getByText("Repeated Customers")).toBeInTheDocument();
  });

  it("displays summary KPI", async () => {
    mockCall.mockResolvedValue({
      message: {
        rows: [],
        summary: { total_customers: 100, new_customers: 30, repeat_customers: 70, avg_repeat_rate_percent: 70 },
      },
    });
    render(<RepeatedCustomers />);
    await waitFor(() => {
      expect(screen.getByText("Total Visits")).toBeInTheDocument();
      expect(screen.getByText("100")).toBeInTheDocument();
    });
  });

  it("displays data table with records", async () => {
    mockCall.mockResolvedValue({
      message: {
        rows: [
          { date: "2026-09-01", total_customers: 50, new_customers: 10, repeat_customers: 40, repeat_rate_percent: 80 },
        ],
        summary: { total_customers: 50, new_customers: 10, repeat_customers: 40, avg_repeat_rate_percent: 80 },
      },
    });
    render(<RepeatedCustomers />);
    await waitFor(() => {
      expect(screen.getByText("2026-09-01")).toBeInTheDocument();
    });
  });

  it("shows data when available", async () => {
    mockCall.mockResolvedValue({
      message: {
        rows: [
          { date: "2026-09-01", total_customers: 50, new_customers: 10, repeat_customers: 40, repeat_rate_percent: 80 },
        ],
        summary: { total_customers: 50, new_customers: 10, repeat_customers: 40, avg_repeat_rate_percent: 80 },
      },
    });
    render(<RepeatedCustomers />);
    await waitFor(() => {
      const repeatRates = screen.getAllByText("80%");
      expect(repeatRates.length).toBeGreaterThan(0);
    });
  });
});
