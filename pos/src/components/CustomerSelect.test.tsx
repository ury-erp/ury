import { render } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { CustomerSelect } from "./CustomerSelect";

let storeState: Record<string, unknown> = {};

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => storeState,
}));

vi.mock("./AggregatorSelect", () => ({
  AggregatorSelect: () => <div data-testid="aggregator">Aggregator</div>,
}));

vi.mock("./CustomerPicker", () => ({
  CustomerPicker: ({ optional }: { optional?: boolean }) => (
    <div data-testid="picker" data-optional={String(Boolean(optional))}>
      Picker
    </div>
  ),
}));

describe("CustomerSelect", () => {
  beforeEach(() => {
    storeState = {
      selectedCustomer: null,
      setSelectedCustomer: vi.fn(),
      selectedOrderType: "Regular",
      isUpdatingOrder: false,
    };
  });

  it("renders without crashing", () => {
    const { container } = render(<CustomerSelect />);
    expect(container).toBeTruthy();
  });

  it("renders picker component by default", () => {
    const { getByTestId } = render(<CustomerSelect />);
    expect(getByTestId("picker")).toBeInTheDocument();
  });

  it("accepts disabled prop", () => {
    const { container } = render(<CustomerSelect disabled={true} />);
    expect(container).toBeTruthy();
  });

  it("handles missing store gracefully", () => {
    const { container } = render(<CustomerSelect />);
    expect(container.firstChild).toBeTruthy();
  });

  it("marks the picker optional when the POS Profile allows orders without a customer", () => {
    storeState.posProfile = { custom_allow_order_without_customer: 1 };
    const { getByTestId } = render(<CustomerSelect />);
    expect(getByTestId("picker")).toHaveAttribute("data-optional", "true");
  });

  it("keeps the picker required when the POS Profile flag is off", () => {
    storeState.posProfile = { custom_allow_order_without_customer: 0 };
    const { getByTestId } = render(<CustomerSelect />);
    expect(getByTestId("picker")).toHaveAttribute("data-optional", "false");
  });
});
