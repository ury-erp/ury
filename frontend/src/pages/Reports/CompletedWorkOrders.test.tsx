import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { CompletedWorkOrders } from "./CompletedWorkOrders";

const mockCall = vi.fn();
vi.mock("@ury/core", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    call: (...args) => mockCall(...args),
  };
});

vi.mock("../../components/DeskLink", () => ({
  DeskLink: ({ name }) => <span>{name}-link</span>,
}));

describe("CompletedWorkOrders", () => {
  beforeEach(() => { cleanup(); mockCall.mockReset(); });

  it("renders header", async () => {
    mockCall.mockResolvedValue({
      message: { work_orders: [], summary: { total_completed: 0, total_qty_produced: 0 } },
    });
    render(<CompletedWorkOrders />);
    expect(screen.getByText("Completed Work Orders")).toBeInTheDocument();
  });

  it("displays summary", async () => {
    mockCall.mockResolvedValue({
      message: {
        work_orders: [],
        summary: { total_completed: 10, total_qty_produced: 500 },
      },
    });
    render(<CompletedWorkOrders />);
    await waitFor(() => {
      const completedLabels = screen.getAllByText("Completed");
      expect(completedLabels.length).toBeGreaterThan(0);
      expect(screen.getByText("10")).toBeInTheDocument();
    });
  });

  it("displays work orders table", async () => {
    mockCall.mockResolvedValue({
      message: {
        work_orders: [
          { name: "WO-001", production_item: "ITEM-001", item_name: "Biryani", qty: 100, produced_qty: 100, planned_end_date: "2026-09-01", actual_end_date: "2026-09-01" },
        ],
        summary: { total_completed: 1, total_qty_produced: 100 },
      },
    });
    render(<CompletedWorkOrders />);
    await waitFor(() => {
      expect(screen.getByText("WO-001-link")).toBeInTheDocument();
      expect(screen.getByText("Biryani")).toBeInTheDocument();
    });
  });

  it("shows empty message", async () => {
    mockCall.mockResolvedValue({
      message: {
        work_orders: [],
        summary: { total_completed: 0, total_qty_produced: 0 },
      },
    });
    render(<CompletedWorkOrders />);
    await waitFor(() => {
      expect(screen.getByText(/No completed work orders/)).toBeInTheDocument();
    });
  });
});
