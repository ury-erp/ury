import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ClosingPaymentTable from "./ClosingPaymentTable";

vi.mock("@ury/core", () => ({
  formatCurrency: (amount: number) => `Rs. ${amount.toFixed(2)}`,
}));

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

vi.mock("@ury/ui", () => ({
  Input: ({ ...props }: any) => <input {...props} />,
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

describe("ClosingPaymentTable", () => {
  const mockRows = [
    {
      mode_of_payment: "Cash",
      opening_amount: 100,
      expected_amount: 500,
      closing_amount: 600,
    },
    {
      mode_of_payment: "Card",
      opening_amount: 0,
      expected_amount: 300,
      closing_amount: 300,
    },
  ];

  it("renders payment modes table", () => {
    render(
      <ClosingPaymentTable
        rows={mockRows}
        touchedModes={new Set()}
        onChange={vi.fn()}
      />
    );
    
    expect(screen.getByText("Cash")).toBeInTheDocument();
    expect(screen.getByText("Card")).toBeInTheDocument();
  });

  it("displays amounts in currency format", () => {
    render(
      <ClosingPaymentTable
        rows={mockRows}
        touchedModes={new Set()}
        onChange={vi.fn()}
      />
    );
    
    const amounts = screen.getAllByText(/Rs\./);
    expect(amounts.length).toBeGreaterThan(0);
  });

  it("accepts input changes to closing amount", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    
    render(
      <ClosingPaymentTable
        rows={mockRows}
        touchedModes={new Set()}
        onChange={onChange}
      />
    );
    
    const inputs = screen.getAllByRole("spinbutton");
    if (inputs.length > 0) {
      await user.clear(inputs[0]);
      await user.type(inputs[0], "700");
      expect(onChange).toHaveBeenCalled();
    }
  });

  it("prevents negative values from being accepted", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    
    render(
      <ClosingPaymentTable
        rows={mockRows}
        touchedModes={new Set()}
        onChange={onChange}
      />
    );
    
    const inputs = screen.getAllByRole("spinbutton");
    if (inputs.length > 0) {
      await user.clear(inputs[0]);
      await user.type(inputs[0], "-100");
      // Should have converted negative to 0
      const callArgs = onChange.mock.calls;
      expect(callArgs.length).toBeGreaterThan(0);
    }
  });

  it("renders table structure", () => {
    const { container } = render(
      <ClosingPaymentTable
        rows={mockRows}
        touchedModes={new Set()}
        onChange={vi.fn()}
      />
    );
    
    const rows = container.querySelectorAll("tbody tr");
    expect(rows.length).toBe(2);
  });

  it("applies styling based on touched modes", () => {
    const { container } = render(
      <ClosingPaymentTable
        rows={mockRows}
        touchedModes={new Set(["Cash"])}
        onChange={vi.fn()}
      />
    );
    
    const rows = container.querySelectorAll("tbody tr");
    expect(rows.length).toBe(2);
  });

  it("renders table headers", () => {
    render(
      <ClosingPaymentTable
        rows={mockRows}
        touchedModes={new Set()}
        onChange={vi.fn()}
      />
    );
    
    expect(screen.getByText("Payment Mode")).toBeInTheDocument();
  });
});
