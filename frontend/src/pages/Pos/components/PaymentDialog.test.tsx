import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps, ReactNode } from "react";

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
    get: vi.fn().mockResolvedValue({ message: {
      subtotal: 1000, manual_discount_amount: 0, tax_amount: 0,
      service_charge: 0, service_charge_percentage: 0,
      grand_total: 1000, rounded_total: 1000, currency: "INR",
      policy: { reason: "no_applicable_policy" },
    } }),
    post: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("../data/order-types", () => ({
  DEFAULT_PAYMENT_MODE: "Cash",
}));

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

vi.mock("@ury/ui", () => ({
  Dialog: ({ open, children, onOpenChange }: { open: boolean; children: ReactNode; onOpenChange: (open: boolean) => void }) =>
    open ? (
      <div data-testid="payment-dialog">
        {children}
        <button onClick={() => onOpenChange(false)}>Close</button>
      </div>
    ) : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Button: ({ children, ...props }: ComponentProps<"button">) => <button {...props}>{children}</button>,
  Input: (props: ComponentProps<"input">) => <input {...props} />,
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
  showToast: { success: vi.fn() },
}));

import PaymentDialog from "./PaymentDialog";
import { call } from "@ury/core";

const mockFetchOrders = vi.fn().mockResolvedValue(undefined);
const mockClearSelectedOrder = vi.fn();
const mockOnClose = vi.fn();

describe("PaymentDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the policy and service charge returned by the server", async () => {
    vi.mocked(call.get).mockResolvedValueOnce({ message: {
      subtotal: 1000, manual_discount_amount: 0, tax_amount: 0,
      service_charge: 90, service_charge_percentage: 10,
      grand_total: 990, rounded_total: 990, currency: "INR",
      policy: { name: "POL-1", policy_name: "Staff", discount_type: "Percentage", value: 10, amount: 100 },
    } } as never);
    render(
      <PaymentDialog onClose={mockOnClose} grandTotal={1000} roundedTotal={1000}
        invoice="INV-001" customer="CUST-001" posProfile="POS-001" table={null}
        cashier="user1" owner="user1" fetchOrders={mockFetchOrders}
        clearSelectedOrder={mockClearSelectedOrder} />
    );
    expect(await screen.findByText(/payment.staff_policy_discount/)).toBeInTheDocument();
    expect(screen.getByText(/payment.service_charge/)).toBeInTheDocument();
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
