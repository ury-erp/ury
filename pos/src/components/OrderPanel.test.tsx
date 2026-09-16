import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import OrderPanel from "./OrderPanel";

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => ({
    activeOrders: [],
    removeFromOrder: vi.fn(),
    updateQuantity: vi.fn(),
    clearOrder: vi.fn(),
    setSelectedItem: vi.fn(),
    orderLoading: false,
    isOrderInteractionDisabled: () => false,
    isUpdatingOrder: false,
    posProfile: { name: "prof1", cashier: "c1", owner: "o1" },
    selectedOrderType: "Dine In",
    selectedTable: "Table-1",
    selectedRoom: "Main",
    selectedCustomer: { name: "cust1" },
    selectedAggregator: null,
    resetOrderState: vi.fn(),
    paymentModes: ["Cash"],
    orderId: null,
    orderComment: "",
    setOrderComment: vi.fn(),
    noOfPax: 2,
    setNoOfPax: vi.fn(),
    lastModifiedTime: null,
  }),
}));

vi.mock("../store/root-store", () => ({
  useRootStore: () => ({
    user: { name: "user1" },
  }),
}));

vi.mock("../lib/order-api", () => ({
  syncOrder: vi.fn(),
}));

vi.mock("@ury/ui", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Spinner: ({ message }: any) => <div>{message}</div>,
  showToast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@ury/core", () => ({
  formatCurrency: () => "amount",
}));

vi.mock("./CustomerSelect", () => ({
  CustomerSelect: () => <div>Customer Select</div>,
}));

vi.mock("./OrderTypeSelect", () => ({
  default: () => <div>Order Type Select</div>,
}));

vi.mock("./ProductDialog", () => ({
  default: () => <div>Product Dialog</div>,
}));

vi.mock("./CommentDialog", () => ({
  default: () => <div>Comment Dialog</div>,
}));

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

describe("OrderPanel", () => {
  it("renders empty cart when no orders", () => {
    render(<OrderPanel />);
    expect(screen.getByText("cart.empty_title")).toBeInTheDocument();
  });

  it("renders order type select", () => {
    render(<OrderPanel />);
    expect(screen.getByText("Order Type Select")).toBeInTheDocument();
  });

  it("renders customer select", () => {
    render(<OrderPanel />);
    expect(screen.getByText("Customer Select")).toBeInTheDocument();
  });

  it("displays pax counter", () => {
    render(<OrderPanel />);
    expect(screen.getByText("cart.pax")).toBeInTheDocument();
  });
});
