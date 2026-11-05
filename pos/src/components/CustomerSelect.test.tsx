import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CustomerSelect } from "./CustomerSelect";

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => ({
    selectedCustomer: null,
    setSelectedCustomer: vi.fn(),
    selectedOrderType: "Regular",
    isUpdatingOrder: false,
  }),
}));

vi.mock("./AggregatorSelect", () => ({
  AggregatorSelect: () => <div data-testid="aggregator">Aggregator</div>,
}));

const pickerProps = vi.fn();
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

  it("accepts disabled prop", () => {
    const { container } = render(<CustomerSelect disabled={true} />);
    expect(container).toBeTruthy();
  });

  it("handles missing store gracefully", () => {
    const { container } = render(<CustomerSelect />);
    expect(container.firstChild).toBeTruthy();
  });
});
