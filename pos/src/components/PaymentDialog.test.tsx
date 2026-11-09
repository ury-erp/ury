import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PaymentDialog from "./PaymentDialog";
import { printOrder } from "../lib/print";
import { call } from "@ury/core";

const mockUsePOSStore = vi.fn();

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => mockUsePOSStore(),
}));

vi.mock("../lib/print", () => ({
  printOrder: vi.fn().mockResolvedValue("qz"),
}));

vi.mock("@ury/core", () => ({
  formatCurrency: (amount: number) => `Rs. ${amount.toFixed(2)}`,
  parseFrappeError: vi.fn((err: any, fallback: string) => err?.message || fallback),
  call: {
    post: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

vi.mock("@ury/ui", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Input: ({ ...props }: any) => <input {...props} />,
  Dialog: ({ children, open }: any) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  showToast: {
    success: vi.fn(),
    error: vi.fn(),
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
    vi.clearAllMocks();
    mockUsePOSStore.mockReturnValue({
      paymentModes: ["Cash", "Card"],
      fetchPaymentModes: vi.fn(),
      posProfile: { enable_discount: 1, enable_payment_without_printing: 0 },
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

  it("shows print invoice checkbox checked by default when enable_payment_without_printing is 1", () => {
    mockUsePOSStore.mockReturnValue({
      paymentModes: ["Cash", "Card"],
      fetchPaymentModes: vi.fn(),
      posProfile: { enable_discount: 1, enable_payment_without_printing: 1 },
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

    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox).toBeInTheDocument();
    expect(checkbox.checked).toBe(true);
  });

  it("hides print invoice checkbox when enable_payment_without_printing is 0", () => {
    mockUsePOSStore.mockReturnValue({
      paymentModes: ["Cash", "Card"],
      fetchPaymentModes: vi.fn(),
      posProfile: { enable_discount: 1, enable_payment_without_printing: 0 },
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

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("prints invoice and completes payment when print invoice is checked", async () => {
    mockUsePOSStore.mockReturnValue({
      paymentModes: ["Cash"],
      fetchPaymentModes: vi.fn(),
      posProfile: { enable_discount: 1, enable_payment_without_printing: 1, print_format: "Standard" },
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

    const checkbox = screen.getByRole("checkbox");
    expect((checkbox as HTMLInputElement).checked).toBe(true);

    const payButton = screen.getByText(/payment.pay_button/);
    fireEvent.click(payButton);

    await waitFor(() => {
      // Step 1: make_invoice with submit_invoice: 0
      expect(call.post).toHaveBeenCalledWith(
        "ury.ury.doctype.ury_order.ury_order.make_invoice",
        expect.objectContaining({ submit_invoice: 0 })
      );
      // Step 2: printOrder called
      expect(printOrder).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: "INV001" })
      );
      // Step 3: submit_order_invoice called
      expect(call.post).toHaveBeenCalledWith(
        "ury.ury.doctype.ury_order.ury_order.submit_order_invoice",
        { invoice: "INV001" }
      );
    });
  });

  it("does not complete payment if print fails when print invoice is checked", async () => {
    mockUsePOSStore.mockReturnValue({
      paymentModes: ["Cash"],
      fetchPaymentModes: vi.fn(),
      posProfile: { enable_discount: 1, enable_payment_without_printing: 1, print_format: "Standard" },
    });

    vi.mocked(printOrder).mockRejectedValueOnce(new Error("Printer is offline"));

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

    const payButton = screen.getByText(/payment.pay_button/);
    fireEvent.click(payButton);

    await waitFor(() => {
      // Step 1 was called
      expect(call.post).toHaveBeenCalledWith(
        "ury.ury.doctype.ury_order.ury_order.make_invoice",
        expect.objectContaining({ submit_invoice: 0 })
      );
      // print was called
      expect(printOrder).toHaveBeenCalled();
      // submit_order_invoice was NOT called!
      expect(call.post).not.toHaveBeenCalledWith(
        "ury.ury.doctype.ury_order.ury_order.submit_order_invoice",
        expect.anything()
      );
    });
  });

  it("does not complete payment if print invoice is unchecked and invoice was not already printed", async () => {
    mockUsePOSStore.mockReturnValue({
      paymentModes: ["Cash"],
      fetchPaymentModes: vi.fn(),
      posProfile: { enable_discount: 1, enable_payment_without_printing: 1, print_format: "Standard" },
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
        order={{ invoice_printed: 0 }}
      />
    );

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    expect((checkbox as HTMLInputElement).checked).toBe(false);

    const payButton = screen.getByText(/payment.pay_button/);
    fireEvent.click(payButton);

    await waitFor(() => {
      expect(call.post).not.toHaveBeenCalled();
    });
  });

  it("completes payment directly if print invoice is unchecked but invoice was already printed", async () => {
    mockUsePOSStore.mockReturnValue({
      paymentModes: ["Cash"],
      fetchPaymentModes: vi.fn(),
      posProfile: { enable_discount: 1, enable_payment_without_printing: 1, print_format: "Standard" },
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
        order={{ invoice_printed: 1 }}
      />
    );

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    expect((checkbox as HTMLInputElement).checked).toBe(false);

    const payButton = screen.getByText(/payment.pay_button/);
    fireEvent.click(payButton);

    await waitFor(() => {
      expect(call.post).toHaveBeenCalledWith(
        "ury.ury.doctype.ury_order.ury_order.make_invoice",
        expect.objectContaining({ submit_invoice: 1 })
      );
    });
  });
});


