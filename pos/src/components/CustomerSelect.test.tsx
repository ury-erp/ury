import { render, screen, cleanup } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerSelect } from "./CustomerSelect";

let usePOSStoreMock = vi.fn(() => ({
  selectedCustomer: null,
  setSelectedCustomer: vi.fn(),
  selectedOrderType: "Dine In",
  isUpdatingOrder: false,
}));

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => usePOSStoreMock(),
}));

vi.mock("./AggregatorSelect", () => ({
  AggregatorSelect: () => <div data-testid="aggregator">Aggregator</div>,
}));

vi.mock("./CustomerPicker", () => ({
  CustomerPicker: ({ value, onChange, disabled }: any) => (
    <div data-testid="picker">
      <input
        type="text"
        value={value?.name || ""}
        onChange={(e) => onChange({ name: e.target.value })}
        disabled={disabled}
        placeholder="Select customer"
      />
    </div>
  ),
}));

describe("CustomerSelect", () => {
  beforeEach(() => {
    cleanup();
    usePOSStoreMock = vi.fn(() => ({
      selectedCustomer: null,
      setSelectedCustomer: vi.fn(),
      selectedOrderType: "Dine In",
      isUpdatingOrder: false,
    }));
  });

  it("renders picker for non-aggregator types", () => {
    render(<CustomerSelect />);
    expect(screen.getByTestId("picker")).toBeInTheDocument();
  });

  it("renders aggregator select for Aggregators", () => {
    usePOSStoreMock = vi.fn(() => ({
      selectedCustomer: null,
      setSelectedCustomer: vi.fn(),
      selectedOrderType: "Aggregators",
      isUpdatingOrder: false,
    }));
    render(<CustomerSelect />);
    expect(screen.getByTestId("aggregator")).toBeInTheDocument();
  });

  it.each(["Dine In", "Take Away", "Delivery", "Phone In"] as const)(
    "keeps picker enabled on open %s orders",
    (orderType) => {
      usePOSStoreMock = vi.fn(() => ({
        selectedCustomer: null,
        setSelectedCustomer: vi.fn(),
        selectedOrderType: orderType,
        isUpdatingOrder: true,
      }));
      render(<CustomerSelect />);
      expect(screen.getByPlaceholderText("Select customer")).not.toBeDisabled();
    }
  );

  it("passes disabled prop to CustomerPicker", () => {
    render(<CustomerSelect disabled={true} />);
    expect(screen.getByPlaceholderText("Select customer")).toBeDisabled();
  });
});
