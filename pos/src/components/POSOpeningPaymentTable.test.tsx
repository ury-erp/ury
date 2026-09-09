import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import POSOpeningPaymentTable from "./POSOpeningPaymentTable";

vi.mock("@ury/core", () => ({
  formatCurrency: (amount: number) => `Rs. ${amount.toFixed(2)}`,
}));

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

vi.mock("@ury/ui", () => ({
  Input: ({ ...props }: any) => <input {...props} />,
}));

describe("POSOpeningPaymentTable", () => {
  const mockPayments = [
    { mode_of_payment: "Cash", opening_amount: 100 },
    { mode_of_payment: "Card", opening_amount: 0 },
  ];

  it("renders payment table with modes", () => {
    render(
      <POSOpeningPaymentTable
        payments={mockPayments}
        onChange={vi.fn()}
      />
    );
    
    expect(screen.getByText("Cash")).toBeInTheDocument();
    expect(screen.getByText("Card")).toBeInTheDocument();
  });

  it("displays opening amounts", () => {
    render(
      <POSOpeningPaymentTable
        payments={mockPayments}
        onChange={vi.fn()}
      />
    );
    
    expect(screen.getByText("Rs. 100.00")).toBeInTheDocument();
  });

  it("renders input fields for editing amounts", () => {
    render(
      <POSOpeningPaymentTable
        payments={mockPayments}
        onChange={vi.fn()}
      />
    );
    
    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it("prevents negative values", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    
    render(
      <POSOpeningPaymentTable
        payments={mockPayments}
        onChange={onChange}
      />
    );
    
    const inputs = screen.getAllByRole("spinbutton");
    if (inputs.length > 0) {
      await user.clear(inputs[0]);
      await user.type(inputs[0], "-50");
      await waitFor(() => {
        const calls = onChange.mock.calls;
        expect(calls.some(call => {
          const arr = call[0];
          return Array.isArray(arr) && arr[0]?.opening_amount === 0;
        })).toBe(true);
      });
    }
  });

  it("displays total opening balance", () => {
    render(
      <POSOpeningPaymentTable
        payments={mockPayments}
        onChange={vi.fn()}
      />
    );
    
    expect(screen.getByText(/pos_opening.total_opening_balance/)).toBeInTheDocument();
    expect(screen.getByText("Rs. 100.00")).toBeInTheDocument();
  });

  it("disables inputs when readOnly is true", () => {
    render(
      <POSOpeningPaymentTable
        payments={mockPayments}
        onChange={vi.fn()}
        readOnly={true}
      />
    );
    
    const inputs = screen.getAllByRole("spinbutton");
    inputs.forEach(input => {
      expect(input).toHaveAttribute("disabled");
    });
  });

  it("disables inputs when disabled is true", () => {
    render(
      <POSOpeningPaymentTable
        payments={mockPayments}
        onChange={vi.fn()}
        disabled={true}
      />
    );
    
    const inputs = screen.getAllByRole("spinbutton");
    inputs.forEach(input => {
      expect(input).toHaveAttribute("disabled");
    });
  });

  it("calculates correct total", () => {
    const paymentsWithDifferentAmounts = [
      { mode_of_payment: "Cash", opening_amount: 100 },
      { mode_of_payment: "Card", opening_amount: 50 },
      { mode_of_payment: "Digital", opening_amount: 25 },
    ];
    
    render(
      <POSOpeningPaymentTable
        payments={paymentsWithDifferentAmounts}
        onChange={vi.fn()}
      />
    );
    
    expect(screen.getByText("Rs. 175.00")).toBeInTheDocument();
  });
});
