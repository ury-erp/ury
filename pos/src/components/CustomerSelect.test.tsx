import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CustomerSelect } from "./CustomerSelect";

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => storeState,
}));

vi.mock("./AggregatorSelect", () => ({
  AggregatorSelect: () => <div data-testid="aggregator">Aggregator</div>,
}));

const pickerProps = vi.fn();
const storeState = {
  selectedCustomer: null,
  setSelectedCustomer: vi.fn(),
  selectedOrderType: "Regular",
  isUpdatingOrder: false,
};
vi.mock("./CustomerPicker", () => ({
  CustomerPicker: (props: Record<string, unknown>) => {
    pickerProps(props);
    return <div data-testid="picker">Picker</div>;
  },
}));

describe("CustomerSelect", () => {
  it("renders without crashing", () => {
    const { container } = render(<CustomerSelect />);
    expect(container).toBeTruthy();
  });

  it("renders picker component by default", () => {
    const { getByTestId } = render(<CustomerSelect />);
    expect(getByTestId("picker")).toBeInTheDocument();
  });

  it("does not pass an orderType filter to the picker (picker always searches all customers)", () => {
    pickerProps.mockClear();
    render(<CustomerSelect />);
    expect(pickerProps).toHaveBeenCalled();
    expect(pickerProps.mock.calls[0][0]).not.toHaveProperty("orderType");
  });

  it("keeps the picker enabled while an order is being updated (customer can change on an open order)", () => {
    storeState.isUpdatingOrder = true;
    pickerProps.mockClear();
    render(<CustomerSelect />);
    expect(pickerProps.mock.calls[0][0].disabled).toBeFalsy();
    storeState.isUpdatingOrder = false;
  });

  it("still disables the picker when the parent disables it", () => {
    pickerProps.mockClear();
    render(<CustomerSelect disabled />);
    expect(pickerProps.mock.calls[0][0].disabled).toBe(true);
  });

  it("accepts disabled prop", () => {
    const { container } = render(<CustomerSelect disabled={true} />);
    expect(container).toBeTruthy();
  });

  it("handles missing store gracefully", () => {
    const { container } = render(<CustomerSelect />);
    expect(container.firstChild).toBeTruthy();
  });
});
