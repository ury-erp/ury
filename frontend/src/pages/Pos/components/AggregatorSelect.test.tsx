import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { AggregatorSelect } from "./AggregatorSelect";

const getAggregatorsMock = vi.fn();

vi.mock("../lib/aggregator-api", () => ({
  getAggregators: (...args: any[]) => getAggregatorsMock(...args),
}));

const usePOSStoreMock = vi.fn();

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => usePOSStoreMock(),
}));

const mockAggregators = [
  { customer: "Zomato", name: "Zomato" },
  { customer: "Swiggy", name: "Swiggy" },
];

describe("AggregatorSelect", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    getAggregatorsMock.mockResolvedValue(mockAggregators);
    usePOSStoreMock.mockReturnValue({
      selectedAggregator: null,
      setSelectedAggregator: vi.fn(),
      fetchAggregatorMenu: vi.fn(),
    });
  });

  it("renders select component", () => {
    render(<AggregatorSelect />);
    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
  });

  it("fetches aggregators on mount", async () => {
    render(<AggregatorSelect />);
    
    await waitFor(() => {
      expect(getAggregatorsMock).toHaveBeenCalled();
    });
  });

  it("displays aggregator options after fetching", async () => {
    render(<AggregatorSelect />);
    
    await waitFor(() => {
      expect(screen.getByText("Zomato")).toBeInTheDocument();
    });
  });

  it("handles fetch errors gracefully", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getAggregatorsMock.mockRejectedValueOnce(new Error("API Error"));
    
    render(<AggregatorSelect />);
    
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
    
    consoleErrorSpy.mockRestore();
  });

  it("disables select when disabled prop is true", () => {
    render(<AggregatorSelect disabled={true} />);
    const select = screen.getByRole("combobox");
    expect(select).toBeDisabled();
  });

  it("displays multiple aggregators in options", async () => {
    render(<AggregatorSelect />);
    
    await waitFor(() => {
      expect(screen.getByText("Zomato")).toBeInTheDocument();
      expect(screen.getByText("Swiggy")).toBeInTheDocument();
    });
  });

  it("renders without crashing", () => {
    render(<AggregatorSelect />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("is enabled after loading completes", async () => {
    render(<AggregatorSelect />);
    const select = screen.getByRole("combobox");
    
    await waitFor(() => {
      expect(select).toBeEnabled();
    });
  });
});
