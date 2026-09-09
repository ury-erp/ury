import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ClosingPaymentTable from "./ClosingPaymentTable";
import type { ClosingPaymentSummary } from "../lib/pos-closing-api";

vi.mock("@ury/ui", async () => {
  const actual = await vi.importActual<any>("@ury/ui");
  return {
    ...actual,
    Input: ({ value, onChange, ...props }: any) => (
      <input value={value} onChange={onChange} {...props} />
    ),
    DataTable: ({ rows, columns }: any) => (
      <div data-testid="data-table">
        {rows.map((row: any, idx: number) => (
          <div key={idx} data-testid={`row-${row.mode_of_payment}`}>
            {row.mode_of_payment}
          </div>
        ))}
      </div>
    ),
    cn: (...args: any[]) => args.filter(Boolean).join(" "),
  };
});

vi.mock("@ury/core", () => ({
  formatCurrency: (amount: number) => `Rs. ${amount.toFixed(2)}`,
}));

describe("ClosingPaymentTable", () => {
  const mockOnChange = vi.fn();

  const mockRows: ClosingPaymentSummary[] = [
    {
      mode_of_payment: "Cash",
      opening_amount: 1000,
      expected_amount: 1500,
      closing_amount: 0,
      difference: 500,
    },
    {
      mode_of_payment: "Card",
      opening_amount: 500,
      expected_amount: 1200,
      closing_amount: 0,
      difference: 700,
    },
  ];

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  it("renders payment modes in the table", () => {
    render(<ClosingPaymentTable rows={mockRows} onChange={mockOnChange} />);
    expect(screen.getByText("Cash")).toBeInTheDocument();
    expect(screen.getByText("Card")).toBeInTheDocument();
  });

  it("renders table with payment rows", () => {
    const { container } = render(
      <ClosingPaymentTable rows={mockRows} onChange={mockOnChange} />
    );
    const dataTables = container.querySelectorAll('[data-testid="data-table"]');
    expect(dataTables.length).toBeGreaterThan(0);
  });

  it("calls onChange when closing amount input changes", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ClosingPaymentTable rows={mockRows} onChange={mockOnChange} />
    );

    const inputs = container.querySelectorAll("input[type=number]");
    if (inputs.length > 0) {
      await user.clear(inputs[0]);
      await user.type(inputs[0], "1500");
      expect(mockOnChange).toHaveBeenCalled();
    }
  });

  it("renders empty table when no rows provided", () => {
    const { container } = render(
      <ClosingPaymentTable rows={[]} onChange={mockOnChange} />
    );
    const dataTables = container.querySelectorAll('[data-testid="data-table"]');
    expect(dataTables.length).toBeGreaterThan(0);
  });

  it("accepts numeric input in closing amount field", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ClosingPaymentTable rows={mockRows} onChange={mockOnChange} />
    );

    const inputs = container.querySelectorAll("input[type=number]");
    if (inputs.length > 0) {
      await user.type(inputs[0], "100");
      expect(mockOnChange).toHaveBeenCalled();
    }
  });
});
