import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { ItemWisePurchaseHistory } from "./ItemWisePurchaseHistory";

vi.mock("../../context/BranchContext", () => ({
  useBranchContext: () => ({ activeBranchId: "Kozhikode" }),
}));

vi.mock("@ury/core", () => ({
  call: vi.fn(),
  formatCurrency: (val) => (val ?? 0).toString(),
}));

import { call } from "@ury/core";

describe("ItemWisePurchaseHistory", () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(call).mockClear();
  });

  it("renders page title", () => {
    vi.mocked(call).mockResolvedValue({
      message: { items: [], summary: { total_qty: 0, total_amount: 0 } }
    });
    render(<ItemWisePurchaseHistory />);
    expect(screen.getByText("Item-wise Purchase History")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    vi.mocked(call).mockReturnValue(new Promise(() => {}));
    render(<ItemWisePurchaseHistory />);
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it("displays purchased items", async () => {
    vi.mocked(call).mockResolvedValue({
      message: {
        items: [{
          item_code: "ITEM-001", item_name: "Chicken", qty: 100,
          avg_rate: 150, amount: 15000, purchase_count: 5, supplier_count: 2
        }],
        summary: { total_qty: 100, total_amount: 15000 }
      }
    });
    render(<ItemWisePurchaseHistory />);
    await waitFor(() => {
      expect(screen.getByText("Chicken")).toBeInTheDocument();
    });
  });

  it("handles errors", async () => {
    vi.mocked(call).mockRejectedValueOnce(new Error("Purchase history error"));
    render(<ItemWisePurchaseHistory />);
    await waitFor(() => {
      expect(screen.getByText("Purchase history error")).toBeInTheDocument();
    });
  });

  it("renders without crashing on empty items", async () => {
    vi.mocked(call).mockResolvedValue({
      message: { items: [], summary: {} }
    });
    render(<ItemWisePurchaseHistory />);
    await waitFor(() => {
      expect(screen.getByText("Item-wise Purchase History")).toBeInTheDocument();
    });
  });

  // Purchase Invoice has no `branch` field, so sending one made the backend
  // fail with a raw SQL error on every branch-scoped call.
  it("never sends a branch argument", async () => {
    vi.mocked(call).mockResolvedValue({
      message: { items: [], summary: { total_qty: 0, total_amount: 0 } }
    });
    render(<ItemWisePurchaseHistory />);
    await waitFor(() => {
      expect(call).toHaveBeenCalled();
    });

    const [method, args] = vi.mocked(call).mock.calls[0];
    expect(method).toBe("ury.ury.report_api.items.get_item_wise_purchase_history");
    expect(args).not.toHaveProperty("branch");
  });

  it("labels the report company-wide", () => {
    vi.mocked(call).mockResolvedValue({
      message: { items: [], summary: { total_qty: 0, total_amount: 0 } }
    });
    render(<ItemWisePurchaseHistory />);
    expect(screen.getByText(/Company-wide/)).toBeInTheDocument();
  });
});
