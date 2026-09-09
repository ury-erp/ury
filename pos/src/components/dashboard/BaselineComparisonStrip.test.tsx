import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import BaselineComparisonStrip from "./BaselineComparisonStrip";

vi.mock("./isPermissionError", () => ({
  isPermissionError: (error: any) => {
    return error?.status === 403 || error?.httpStatus === 403;
  },
}));

const { mockCall } = vi.hoisted(() => ({
  mockCall: {
    get: vi.fn(),
  },
}));

vi.mock("@ury/core", () => ({
  call: mockCall,
  formatCurrency: (amount: number) => `Rs. ${amount.toFixed(2)}`,
}));

const mockComparison = {
  window: "tonight",
  sample_days: 7,
  current: { sales: 5000, covers: 45 },
  baseline: { sales: 4500, covers: 42 },
  delta: { sales: 500, covers: 3, sales_pct: 11.1, covers_pct: 7.1 },
};

describe("BaselineComparisonStrip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders title", async () => {
    mockCall.get.mockResolvedValueOnce({ message: mockComparison });

    render(<BaselineComparisonStrip />);

    await waitFor(() => {
      expect(screen.getByText("Tonight vs a normal day")).toBeInTheDocument();
    });
  });

  it("displays loading state initially", () => {
    mockCall.get.mockImplementation(() => new Promise(() => {}));
    render(<BaselineComparisonStrip />);
    expect(screen.getByText(/Loading.../i)).toBeInTheDocument();
  });

  it("displays no data state when no comparison", async () => {
    mockCall.get.mockResolvedValueOnce({ message: null });

    render(<BaselineComparisonStrip />);

    await waitFor(() => {
      expect(screen.getByText(/No data available/i)).toBeInTheDocument();
    });
  });

  it("renders comparison data when loaded", async () => {
    mockCall.get.mockResolvedValueOnce({ message: mockComparison });

    render(<BaselineComparisonStrip />);

    await waitFor(() => {
      expect(screen.getByText(/Sales so far/i)).toBeInTheDocument();
      expect(screen.getByText(/Covers/i)).toBeInTheDocument();
    });
  });

  it("displays current covers value", async () => {
    mockCall.get.mockResolvedValueOnce({ message: mockComparison });

    render(<BaselineComparisonStrip />);

    await waitFor(() => {
      expect(screen.getByText("45")).toBeInTheDocument();
    });
  });

  it("shows error message on fetch failure", async () => {
    mockCall.get.mockRejectedValueOnce(new Error("Network error"));

    render(<BaselineComparisonStrip />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load baseline comparison/i)).toBeInTheDocument();
    });
  });

  it("hides component on permission error", async () => {
    mockCall.get.mockRejectedValueOnce({ httpStatus: 403 });

    const { container } = render(<BaselineComparisonStrip />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("includes branch in API call when provided", async () => {
    mockCall.get.mockResolvedValueOnce({ message: mockComparison });

    render(<BaselineComparisonStrip branch="Main Branch" />);

    await waitFor(() => {
      expect(mockCall.get).toHaveBeenCalledWith("ury.ury.api.ury_dashboard.get_baseline_comparison", {
        branch: "Main Branch",
      });
    });
  });

  it("displays positive delta in green", async () => {
    mockCall.get.mockResolvedValueOnce({ message: mockComparison });

    const { container } = render(<BaselineComparisonStrip />);

    await waitFor(() => {
      const positiveDeltas = container.querySelectorAll(".text-emerald-600");
      expect(positiveDeltas.length).toBeGreaterThan(0);
    });
  });

  it("shows sample days in subtitle when available", async () => {
    mockCall.get.mockResolvedValueOnce({ message: mockComparison });

    render(<BaselineComparisonStrip />);

    await waitFor(() => {
      expect(screen.getByText(/last 7 same weekdays/i)).toBeInTheDocument();
    });
  });
});
