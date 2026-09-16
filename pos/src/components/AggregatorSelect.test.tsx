import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AggregatorSelect } from "./AggregatorSelect";

// Mock the API
const getAggregatorsMock = vi.fn();
vi.mock("../lib/aggregator-api", () => ({
  getAggregators: (...args: any[]) => getAggregatorsMock(...args),
}));

// Mock the store
const usePOSStoreMock = vi.fn();
vi.mock("../store/pos-store", () => ({
  usePOSStore: (...args: any[]) => usePOSStoreMock(...args),
}));

// Mock @ury/ui components
vi.mock("@ury/ui", () => ({
  Select: ({ 
    value, 
    onValueChange, 
    disabled, 
    placeholder, 
    children 
  }: any) => (
    <select
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      disabled={disabled}
      data-testid="aggregator-select"
      data-placeholder={placeholder}
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  ),
  SelectItem: ({ value, children }: any) => (
    <option value={value}>{children}</option>
  ),
}));

describe("AggregatorSelect", () => {
  const mockAggregators = [
    { customer: "Zomato" },
    { customer: "Swiggy" },
    { customer: "Uber Eats" },
  ];

  beforeEach(() => {
    getAggregatorsMock.mockReset();
    usePOSStoreMock.mockReset();

    usePOSStoreMock.mockReturnValue({
      selectedAggregator: null,
      setSelectedAggregator: vi.fn(),
      fetchAggregatorMenu: vi.fn(),
    });
  });

  it("renders the select component", async () => {
    getAggregatorsMock.mockResolvedValueOnce(mockAggregators);

    render(<AggregatorSelect />);
    
    await waitFor(() => {
      expect(screen.getByTestId("aggregator-select")).toBeInTheDocument();
    });
  });

  it("loads aggregators on mount", async () => {
    getAggregatorsMock.mockResolvedValueOnce(mockAggregators);

    render(<AggregatorSelect />);

    await waitFor(() => {
      expect(getAggregatorsMock).toHaveBeenCalled();
    });
  });

  it("displays aggregators as options", async () => {
    getAggregatorsMock.mockResolvedValueOnce(mockAggregators);

    render(<AggregatorSelect />);

    await waitFor(() => {
      expect(screen.getByText("Zomato")).toBeInTheDocument();
      expect(screen.getByText("Swiggy")).toBeInTheDocument();
      expect(screen.getByText("Uber Eats")).toBeInTheDocument();
    });
  });

  it("handles aggregator selection", async () => {
    const user = userEvent.setup();
    const fetchAggregatorMenu = vi.fn();
    const setSelectedAggregator = vi.fn();

    getAggregatorsMock.mockResolvedValueOnce(mockAggregators);
    usePOSStoreMock.mockReturnValue({
      selectedAggregator: null,
      setSelectedAggregator,
      fetchAggregatorMenu,
    });

    render(<AggregatorSelect />);

    await waitFor(() => {
      expect(screen.getByTestId("aggregator-select")).toBeInTheDocument();
    });

    const select = screen.getByTestId("aggregator-select");
    await user.selectOptions(select, "Zomato");

    await waitFor(() => {
      expect(setSelectedAggregator).toHaveBeenCalled();
      expect(fetchAggregatorMenu).toHaveBeenCalledWith("Zomato");
    });
  });

  it("handles API errors gracefully", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getAggregatorsMock.mockRejectedValueOnce(new Error("API Error"));

    render(<AggregatorSelect />);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to fetch aggregators:",
        expect.any(Error)
      );
    });

    consoleErrorSpy.mockRestore();
  });

  it("disables select when disabled prop is true", async () => {
    getAggregatorsMock.mockResolvedValueOnce(mockAggregators);

    render(<AggregatorSelect disabled={true} />);

    await waitFor(() => {
      const select = screen.getByTestId("aggregator-select");
      expect(select).toBeDisabled();
    });
  });

  it("shows loading message initially", () => {
    getAggregatorsMock.mockImplementationOnce(
      () => new Promise(() => {}) // Never resolves
    );

    render(<AggregatorSelect />);
    
    const select = screen.getByTestId("aggregator-select");
    expect(select).toHaveAttribute("data-placeholder", "Loading aggregators...");
  });
});
