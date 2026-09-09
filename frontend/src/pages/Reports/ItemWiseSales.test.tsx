import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItemWiseSales } from "./ItemWiseSales";

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

describe("ItemWiseSales", () => {
  beforeEach(() => { cleanup(); mockCall.mockReset(); });

  it("renders header", () => {
    mockCall.mockResolvedValue({ message: { items: [], summary: { total_qty: 0, total_amount: 0, unique_items: 0 }, pagination: { page: 1, page_size: 50, total: 0, total_pages: 0 } } });
    render(<ItemWiseSales />);
    expect(screen.getByText("Item Wise Sales")).toBeInTheDocument();
  });

  it("displays KPI summary", async () => {
    mockCall.mockResolvedValue({
      message: {
        items: [{ item_code: "ITEM-001", item_name: "Biryani", item_group: "Main", qty: 100, amount: 5000, avg_price: 50, pct_of_total_amount: 25 }],
        summary: { total_qty: 100, total_amount: 5000, unique_items: 1 },
        pagination: { page: 1, page_size: 50, total: 1, total_pages: 1 },
      },
    });
    render(<ItemWiseSales />);
    await waitFor(() => {
      expect(screen.getByText("Unique Items Sold")).toBeInTheDocument();
      expect(screen.getByText("1")).toBeInTheDocument();
    });
  });

  it("displays items table", async () => {
    mockCall.mockResolvedValue({
      message: {
        items: [{ item_code: "ITEM-001", item_name: "Biryani", item_group: "Main", qty: 100, amount: 5000, avg_price: 50, pct_of_total_amount: 25 }],
        summary: { total_qty: 100, total_amount: 5000, unique_items: 1 },
        pagination: { page: 1, page_size: 50, total: 1, total_pages: 1 },
      },
    });
    render(<ItemWiseSales />);
    await waitFor(() => {
      expect(screen.getByText("Biryani")).toBeInTheDocument();
      expect(screen.getByText("Main")).toBeInTheDocument();
    });
  });

  it("filters by search", async () => {
    mockCall.mockResolvedValue({ message: { items: [], summary: { total_qty: 0, total_amount: 0, unique_items: 0 }, pagination: { page: 1, page_size: 50, total: 0, total_pages: 1 } } });
    render(<ItemWiseSales />);
    const searchInput = screen.getByPlaceholderText("Search items...");
    await userEvent.type(searchInput, "biryani");
    await waitFor(() => {
      expect(mockCall).toHaveBeenCalled();
    });
  });

  it("handles pagination", async () => {
    mockCall.mockResolvedValue({
      message: {
        items: [{ item_code: "ITEM-001", item_name: "Item", item_group: null, qty: 1, amount: 100, avg_price: 100, pct_of_total_amount: 100 }],
        summary: { total_qty: 1, total_amount: 100, unique_items: 1 },
        pagination: { page: 1, page_size: 50, total: 100, total_pages: 2 },
      },
    });
    render(<ItemWiseSales />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Next/ })).toBeInTheDocument();
    });
  });
});
