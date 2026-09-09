import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import PaymentDialog from "./PaymentDialog";

const mockUsePOSStore = vi.fn();

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => mockUsePOSStore(),
}));

vi.mock("@ury/core", () => ({
  formatCurrency: (amount: number) => `Rs. ${amount.toFixed(2)}`,
  call: {
    post: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

vi.mock("@ury/ui", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Input: ({ ...props }: any) => <input {...props} />,
  Dialog: ({ children, onOpenChange, open }: any) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  showToast: {
    success: vi.fn(),
  },
}));

vi.mock("../i18n", () => ({
  t: (key: string, params?: any) => {
    if (params) return `${key}: ${JSON.stringify(params)}`;
    return key;
  },
}));

describe("PaymentDialog", () => {
  beforeEach(() => {
    mockUsePOSStore.mockReturnValue({
      paymentModes: ["Cash", "Card"],
      fetchPaymentModes: vi.fn(),
      posProfile: { enable_discount: 1 },
    });
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
