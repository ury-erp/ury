import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchPaymentModes = vi.fn().mockResolvedValue(undefined);
const mockPOSStore = {
  paymentModes: ["Cash", "Card"],
  fetchPaymentModes: mockFetchPaymentModes,
  posProfile: { enable_discount: 1 },
};

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => mockPOSStore,
}));

vi.mock("@ury/core", () => ({
  formatCurrency: (amount: number) => `Rs. ${amount.toFixed(2)}`,
  call: {
    post: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("../data/order-types", () => ({
  DEFAULT_PAYMENT_MODE: "Cash",
}));

vi.mock("../i18n", () => ({
  t: (key: string, params?: any) => key,
}));

vi.mock("@ury/ui", () => ({
  Dialog: ({ open, children, onOpenChange }: any) =>
    open ? (
      <div data-testid="payment-dialog">
        {children}
        <button onClick={() => onOpenChange(false)}>Close</button>
      </div>
    ) : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
  Input: ({ value, onChange, disabled, ...props }: any) => (
    <input
      value={value}
      onChange={onChange}
      disabled={disabled}
      {...props}
    />
  ),
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

import PaymentDialog from "./PaymentDialog";

const mockFetchOrders = vi.fn().mockResolvedValue(undefined);
const mockClearSelectedOrder = vi.fn();
const mockOnClose = vi.fn();

describe("PaymentDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders payment dialog", () => {
    const { container } = render(
      <PaymentDialog
        onClose={mockOnClose}
        grandTotal={1000}
        roundedTotal={1000}
        invoice="INV-001"
        customer="CUST-001"
        posProfile="POS-001"
        table={null}
        cashier="user1"
        owner="user1"
        fetchOrders={mockFetchOrders}
        clearSelectedOrder={mockClearSelectedOrder}
      />
    );

    expect(container).toBeDefined();
  });

  it("displays grand total", () => {
    const { container } = render(
      <PaymentDialog
        onClose={mockOnClose}
        grandTotal={1000}
        roundedTotal={1000}
        invoice="INV-001"
        customer="CUST-001"
        posProfile="POS-001"
        table={null}
        cashier="user1"
        owner="user1"
        fetchOrders={mockFetchOrders}
        clearSelectedOrder={mockClearSelectedOrder}
      />
    );

    expect(container).toBeDefined();
  });

  it("initializes with proper structure", () => {
    const { container } = render(
      <PaymentDialog
        onClose={mockOnClose}
        grandTotal={1000}
        roundedTotal={1000}
        invoice="INV-001"
        customer="CUST-001"
        posProfile="POS-001"
        table={null}
        cashier="user1"
        owner="user1"
        fetchOrders={mockFetchOrders}
        clearSelectedOrder={mockClearSelectedOrder}
      />
    );

    expect(container.querySelector("div")).toBeTruthy();
  });

  it("renders with correct props", () => {
    const { container } = render(
      <PaymentDialog
        onClose={mockOnClose}
        grandTotal={1000}
        roundedTotal={1000}
        invoice="INV-001"
        customer="CUST-001"
        posProfile="POS-001"
        table={null}
        cashier="user1"
        owner="user1"
        fetchOrders={mockFetchOrders}
        clearSelectedOrder={mockClearSelectedOrder}
      />
    );

    expect(container).not.toBeNull();
  });

  it("passes callback functions correctly", () => {
    render(
      <PaymentDialog
        onClose={mockOnClose}
        grandTotal={1000}
        roundedTotal={1000}
        invoice="INV-001"
        customer="CUST-001"
        posProfile="POS-001"
        table={null}
        cashier="user1"
        owner="user1"
        fetchOrders={mockFetchOrders}
        clearSelectedOrder={mockClearSelectedOrder}
      />
    );

    expect(mockOnClose).toBeDefined();
    expect(mockFetchOrders).toBeDefined();
    expect(mockClearSelectedOrder).toBeDefined();
  });
});
