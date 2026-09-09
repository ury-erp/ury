import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import FastMovingItems from "./FastMovingItems";

vi.mock("./isPermissionError", () => ({
  isPermissionError: (error: any) => {
    return error?.status === 403 || error?.httpStatus === 403;
  },
}));

const mockFastMovingItems = [
  { item: "ITEM-001", item_name: "Biryani", qty_sold: 50, sell_rate_per_hour: 25 },
  { item: "ITEM-002", item_name: "Curry", qty_sold: 30, sell_rate_per_hour: 15 },
  { item: "ITEM-003", item_name: "Rice", qty_sold: 40, sell_rate_per_hour: 20 },
];

const mockCall = {
  get: vi.fn(),
};

vi.mock("@ury/core", () => ({
  call: mockCall,
}));

describe("FastMovingItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCall.get.mockReset();
  });

  it("renders title", async () => {
    mockCall.get.mockResolvedValueOnce({ message: [] });

    render(<FastMovingItems />);

    await waitFor(() => {
      expect(screen.getByText("Fast Moving")).toBeInTheDocument();
    });
  });

  it("displays loading state initially", () => {
    mockCall.get.mockImplementation(() => new Promise(() => {}));
    render(<FastMovingItems />);
    expect(screen.getByText(/Loading.../i)).toBeInTheDocument();
  });

  it("displays empty state when no items", async () => {
    mockCall.get.mockResolvedValueOnce({ message: [] });

    render(<FastMovingItems />);

    await waitFor(() => {
      expect(screen.getByText(/No sales activity to rank yet/i)).toBeInTheDocument();
    });
  });

  it("renders fast moving items with sell rates", async () => {
    mockCall.get.mockResolvedValueOnce({ message: mockFastMovingItems });

    render(<FastMovingItems />);

    await waitFor(() => {
      expect(screen.getByText("Biryani")).toBeInTheDocument();
      expect(screen.getByText("Curry")).toBeInTheDocument();
      expect(screen.getByText("Rice")).toBeInTheDocument();
    });
  });

  it("shows error message on fetch failure", async () => {
    mockCall.get.mockRejectedValueOnce(new Error("Network error"));

    render(<FastMovingItems />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load fast-moving items/i)).toBeInTheDocument();
    });
  });

  it("hides component on permission error", async () => {
    mockCall.get.mockRejectedValueOnce({ httpStatus: 403 });

    const { container } = render(<FastMovingItems />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("includes branch in API call when provided", async () => {
    mockCall.get.mockResolvedValueOnce({ message: [] });

    render(<FastMovingItems branch="Main Branch" windowDays={7} />);

    await waitFor(() => {
      expect(mockCall.get).toHaveBeenCalledWith("ury.ury.api.ury_fast_moving.get_fast_moving_items", {
        branch: "Main Branch",
        window_days: 7,
      });
    });
  });

  it("renders descriptive text about sell rate", async () => {
    mockCall.get.mockResolvedValueOnce({ message: mockFastMovingItems });

    render(<FastMovingItems />);

    await waitFor(() => {
      expect(screen.getByText(/Based on recent sell rate, not a live stock count/i)).toBeInTheDocument();
    });
  });

  it("limits display to 8 items", async () => {
    const manyItems = Array.from({ length: 15 }, (_, i) => ({
      item: `ITEM-${i}`,
      item_name: `Item ${i}`,
      qty_sold: 10 + i,
      sell_rate_per_hour: 5 + i,
    }));

    mockCall.get.mockResolvedValueOnce({ message: manyItems });

    render(<FastMovingItems />);

    await waitFor(() => {
      const itemElements = screen.queryAllByText(/Item \d+/);
      expect(itemElements.length).toBeLessThanOrEqual(8);
    });
  });

  it("displays sell rate per hour", async () => {
    mockCall.get.mockResolvedValueOnce({ message: mockFastMovingItems });

    render(<FastMovingItems />);

    await waitFor(() => {
      expect(screen.getByText(/25\/hr/i)).toBeInTheDocument();
      expect(screen.getByText(/15\/hr/i)).toBeInTheDocument();
    });
  });
});
