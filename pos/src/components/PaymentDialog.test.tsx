import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import PaymentDialog from "./PaymentDialog";
import { call } from "@ury/core";
import type { ComponentProps, ReactNode } from "react";

const mockUsePOSStore = vi.fn();

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => mockUsePOSStore(),
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
    post: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

vi.mock("@ury/ui", () => ({
  Button: ({ children, ...props }: ComponentProps<"button">) => <button {...props}>{children}</button>,
  Input: (props: ComponentProps<"input">) => <input {...props} />,
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div data-testid="dialog-content">{children}</div>,
  showToast: {
    success: vi.fn(),
  },
}));

vi.mock("../i18n", () => ({
  t: (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}: ${JSON.stringify(params)}`;
    return key;
  },
}));

describe("PaymentDialog", () => {
  beforeEach(() => {
    vi.mocked(call.get).mockClear();
    mockUsePOSStore.mockReturnValue({
      paymentModes: ["Cash", "Card"],
      fetchPaymentModes: vi.fn(),
      posProfile: { enable_discount: 1 },
    });
  });

  it("shows the server policy and service charge before payment", async () => {
    vi.mocked(call.get).mockResolvedValueOnce({ message: {
      subtotal: 1000, manual_discount_amount: 0, tax_amount: 0,
      service_charge: 90, service_charge_percentage: 10,
      grand_total: 990, rounded_total: 990, currency: "INR",
      policy: { name: "POL-1", policy_name: "Staff", discount_type: "Percentage", value: 10, amount: 100, remaining_limit: 50 },
    } } as never);
    render(
      <PaymentDialog onClose={vi.fn()} grandTotal={1000} roundedTotal={1000}
        invoice="INV001" customer="CUST001" posProfile="POS001" table={null}
        cashier="user1" owner="user1" fetchOrders={vi.fn()} clearSelectedOrder={vi.fn()} />
    );
    expect(await screen.findByText(/payment.staff_policy_discount/)).toBeInTheDocument();
    expect(screen.getByText(/payment.service_charge/)).toBeInTheDocument();
    expect(call.get).toHaveBeenCalledWith(
      "ury.ury.api.pos_billing.get_invoice_billing_quote",
      { invoice: "INV001", manual_discount_percentage: 0 },
    );
  });

  it("renders payment dialog", () => {
    render(
      <PaymentDialog
        onClose={vi.fn()}
        grandTotal={1000}
        roundedTotal={1000}
        invoice="INV001"
        customer="CUST001"
        posProfile="POS001"
        table={null}
        cashier="user1"
        owner="user1"
        fetchOrders={vi.fn()}
        clearSelectedOrder={vi.fn()}
      />
    );
    
    expect(screen.getByTestId("dialog-content")).toBeInTheDocument();
  });

  it("displays order summary with subtotal", () => {
    render(
      <PaymentDialog
        onClose={vi.fn()}
        grandTotal={1000}
        roundedTotal={1000}
        invoice="INV001"
        customer="CUST001"
        posProfile="POS001"
        table={null}
        cashier="user1"
        owner="user1"
        fetchOrders={vi.fn()}
        clearSelectedOrder={vi.fn()}
      />
    );
    
    expect(screen.getByText(/payment.subtotal/)).toBeInTheDocument();
  });

  it("displays payment mode labels", () => {
    render(
      <PaymentDialog
        onClose={vi.fn()}
        grandTotal={1000}
        roundedTotal={1000}
        invoice="INV001"
        customer="CUST001"
        posProfile="POS001"
        table={null}
        cashier="user1"
        owner="user1"
        fetchOrders={vi.fn()}
        clearSelectedOrder={vi.fn()}
      />
    );
    
    expect(screen.getByText("Cash")).toBeInTheDocument();
    expect(screen.getByText("Card")).toBeInTheDocument();
  });

  it("renders pay button", () => {
    render(
      <PaymentDialog
        onClose={vi.fn()}
        grandTotal={1000}
        roundedTotal={1000}
        invoice="INV001"
        customer="CUST001"
        posProfile="POS001"
        table={null}
        cashier="user1"
        owner="user1"
        fetchOrders={vi.fn()}
        clearSelectedOrder={vi.fn()}
      />
    );
    
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("shows discount section when enable_discount is true", () => {
    render(
      <PaymentDialog
        onClose={vi.fn()}
        grandTotal={1000}
        roundedTotal={1000}
        invoice="INV001"
        customer="CUST001"
        posProfile="POS001"
        table={null}
        cashier="user1"
        owner="user1"
        fetchOrders={vi.fn()}
        clearSelectedOrder={vi.fn()}
      />
    );
    
    expect(screen.getByText(/payment.apply_discount/)).toBeInTheDocument();
  });

  it("hides discount section when enable_discount is false", () => {
    mockUsePOSStore.mockReturnValue({
      paymentModes: ["Cash", "Card"],
      fetchPaymentModes: vi.fn(),
      posProfile: { enable_discount: 0 },
    });

    render(
      <PaymentDialog
        onClose={vi.fn()}
        grandTotal={1000}
        roundedTotal={1000}
        invoice="INV001"
        customer="CUST001"
        posProfile="POS001"
        table={null}
        cashier="user1"
        owner="user1"
        fetchOrders={vi.fn()}
        clearSelectedOrder={vi.fn()}
      />
    );
    
    expect(screen.queryByText(/payment.apply_discount/)).not.toBeInTheDocument();
  });

  it("displays table name when provided", () => {
    render(
      <PaymentDialog
        onClose={vi.fn()}
        grandTotal={1000}
        roundedTotal={1000}
        invoice="INV001"
        customer="CUST001"
        posProfile="POS001"
        table="TABLE1"
        tableLabel="Table A"
        cashier="user1"
        owner="user1"
        fetchOrders={vi.fn()}
        clearSelectedOrder={vi.fn()}
      />
    );
    
    expect(screen.getByText("Table A")).toBeInTheDocument();
  });

  it("displays order summary section", () => {
    render(
      <PaymentDialog
        onClose={vi.fn()}
        grandTotal={1000}
        roundedTotal={1000}
        invoice="INV001"
        customer="CUST001"
        posProfile="POS001"
        table={null}
        cashier="user1"
        owner="user1"
        fetchOrders={vi.fn()}
        clearSelectedOrder={vi.fn()}
      />
    );
    
    expect(screen.getByText(/payment.order_summary/)).toBeInTheDocument();
  });
});
