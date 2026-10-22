import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import POSClosingDialog from "./POSClosingDialog";

const getOpenPosOpeningEntriesMock = vi.fn();
const getSubCashierPosInvoicesMock = vi.fn();
const getMainCashierPosInvoicesMock = vi.fn();
const createSubPosClosingMock = vi.fn();
const submitSubPosClosingMock = vi.fn();
const createPosClosingEntryMock = vi.fn();
const submitPosClosingEntryMock = vi.fn();
const getChecklistMock = vi.fn();

// Stable identities: fresh objects per render would re-trigger the
// loadClosingDetails effect on every state change, resetting rows and
// touchedModes mid-test.
const { mockPosProfile, mockUser } = vi.hoisted(() => ({
  mockPosProfile: {
    name: "POS-1",
    company: "Test Company",
    owner: "test_user",
    multiple_cashier: 0,
  },
  mockUser: { name: "test_user", full_name: "Test User" },
}));

vi.mock("../lib/pos-closing-api", () => ({
  getOpenPosOpeningEntries: (...args: any[]) => getOpenPosOpeningEntriesMock(...args),
  getSubCashierPosInvoices: (...args: any[]) => getSubCashierPosInvoicesMock(...args),
  getMainCashierPosInvoices: (...args: any[]) => getMainCashierPosInvoicesMock(...args),
  createSubPosClosing: (...args: any[]) => createSubPosClosingMock(...args),
  submitSubPosClosing: (...args: any[]) => submitSubPosClosingMock(...args),
  createPosClosingEntry: (...args: any[]) => createPosClosingEntryMock(...args),
  submitPosClosingEntry: (...args: any[]) => submitPosClosingEntryMock(...args),
}));

vi.mock("../lib/checklist-api", () => ({
  getChecklist: (...args: any[]) => getChecklistMock(...args),
}));

vi.mock("@ury/core", () => ({
  call: {
    get: vi.fn().mockResolvedValue({
      message: { owner: "test_user", multiple_cashier: 0 },
    }),
  },
  db: {
    getDoc: vi.fn().mockResolvedValue({
      name: "POSOpeningEntry-1",
      balance_details: [
        { mode_of_payment: "Cash", opening_amount: 1000 },
        { mode_of_payment: "Card", opening_amount: 0 },
      ],
    }),
  },
  formatCurrency: (amount: number) => "Rs. " + amount,
}));

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => ({
    posProfile: mockPosProfile,
  }),
}));

vi.mock("../store/root-store", () => ({
  useRootStore: () => ({
    user: mockUser,
  }),
}));

vi.mock("../i18n", () => ({
  t: (key: string) => (key === "pos_closing.submit_failed" ? "Failed to close POS" : key),
}));

vi.mock("./ClosingPaymentTable", () => ({
  default: ({ rows, onChange }: any) => (
    <div>
      {rows.map((row: any) => (
        <div key={row.mode_of_payment}>
          <span data-testid={`expected-${row.mode_of_payment}`}>
            {row.expected_amount}
          </span>
          <input
            data-testid={row.mode_of_payment}
            type="number"
            value={row.closing_amount}
            onChange={(e) => onChange(row.mode_of_payment, Number(e.target.value))}
          />
        </div>
      ))}
    </div>
  ),
}));

vi.mock("./ChecklistGateDialog", () => ({
  default: ({ onComplete }: any) => (
    <div>
      <button onClick={onComplete}>Complete Checklist</button>
    </div>
  ),
}));

describe("POSClosingDialog", () => {
  const mockOpeningEntry = {
    name: "POSOpeningEntry-1",
    user: "test_user",
    period_start_date: "2024-01-01 09:00:00",
  };

  const mockInvoices = [
    {
      name: "SI-001",
      grand_total: 1000,
      net_total: 900,
      total_qty: 2,
      payments: [{ mode_of_payment: "Cash", amount: 1000, account: "Cash Account" }],
      account_for_change_amount: "Cash Account",
      change_amount: 0,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    getOpenPosOpeningEntriesMock.mockResolvedValue([mockOpeningEntry]);
    getSubCashierPosInvoicesMock.mockResolvedValue(mockInvoices);
    getMainCashierPosInvoicesMock.mockResolvedValue(mockInvoices);
    getChecklistMock.mockResolvedValue({ logStatus: "Complete" });
  });

  it("renders dialog title when open", async () => {
    render(
      <POSClosingDialog
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("pos_closing.title")).toBeInTheDocument();
    });
  });

  it("loads opening entry and invoices on mount", async () => {
    render(
      <POSClosingDialog
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(getOpenPosOpeningEntriesMock).toHaveBeenCalled();
      expect(getMainCashierPosInvoicesMock).toHaveBeenCalled();
    });
  });

  it("displays loading spinner while loading", async () => {
    getOpenPosOpeningEntriesMock.mockImplementationOnce(
      () => new Promise(resolve => setTimeout(() => resolve([mockOpeningEntry]), 100))
    );

    render(
      <POSClosingDialog
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.getByText("pos_closing.loading")).toBeInTheDocument();
  });

  it("displays error message if no opening entry found", async () => {
    getOpenPosOpeningEntriesMock.mockResolvedValueOnce([]);

    render(
      <POSClosingDialog
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("pos_closing.no_open_entry")).toBeInTheDocument();
    });
  });

  it("displays payment totals", async () => {
    render(
      <POSClosingDialog
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("pos_closing.grand_total")).toBeInTheDocument();
      expect(screen.getByText("pos_closing.net_total")).toBeInTheDocument();
      expect(screen.getByText("pos_closing.total_qty")).toBeInTheDocument();
      expect(screen.getByText("pos_closing.total_invoices")).toBeInTheDocument();
    });
  });

  it("renders closing payment table", async () => {
    render(
      <POSClosingDialog
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("Cash")).toBeInTheDocument();
    });
  });

  it("prevents submission if closing amounts are not entered", async () => {
    render(
      <POSClosingDialog
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("pos_closing.submit")).toBeInTheDocument();
    });

    const submitButton = screen.getByText("pos_closing.submit") as HTMLButtonElement;
    expect(submitButton).toBeDisabled();
  });

  it("calls onOpenChange with false when cancel is clicked", async () => {
    const onOpenChange = vi.fn();
    render(
      <POSClosingDialog
        open={true}
        onOpenChange={onOpenChange}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("common.cancel")).toBeInTheDocument();
    });

    const cancelButton = screen.getByText("common.cancel");
    await userEvent.click(cancelButton);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("computes expected_amount as opening + sales for pre-aggregated payments (ERPNext v16)", async () => {
    // ERPNext v16 get_invoices returns {invoices, payments, taxes} with
    // payments pre-aggregated by mode and change_amount already deducted.
    getMainCashierPosInvoicesMock.mockResolvedValueOnce({
      invoices: [
        {
          name: "SI-001",
          grand_total: 693,
          net_total: 693,
          total_qty: 1,
          payments: [],
          taxes: [],
        },
      ],
      payments: [{ mode_of_payment: "Cash", amount: 693, account: "Cash Account" }],
      taxes: [],
    });

    render(
      <POSClosingDialog
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    // Opening balance for Cash is 1000 (db.getDoc mock) + 693 sales = 1693.
    // 693 must NOT be reduced again by any change_amount.
    await waitFor(() => {
      expect(screen.getByTestId("expected-Cash")).toHaveTextContent("1693");
    });
  });

  it("computes expected_amount as opening + sales for per-invoice payments", async () => {
    // Legacy shape: bare invoice list; change_amount is deducted client-side
    // when the payment account matches account_for_change_amount.
    getMainCashierPosInvoicesMock.mockResolvedValueOnce([
      {
        name: "SI-001",
        grand_total: 1000,
        net_total: 900,
        total_qty: 2,
        payments: [{ mode_of_payment: "Cash", amount: 1000, account: "Cash Account" }],
        account_for_change_amount: "Cash Account",
        change_amount: 50,
        taxes: [],
      },
    ]);

    render(
      <POSClosingDialog
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    // Opening 1000 + (1000 payment - 50 change) = 1950.
    await waitFor(() => {
      expect(screen.getByTestId("expected-Cash")).toHaveTextContent("1950");
    });
  });

  it("gates closing submission on a pending Closing checklist before creating the doc", async () => {
    // First poll: checklist pending (role-based Dependent Checklist goal
    // without a Quality Review). After completion: Complete.
    getChecklistMock
      .mockResolvedValueOnce({ logStatus: null })
      .mockResolvedValue({ logStatus: "Complete" });

    render(
      <POSClosingDialog
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("Cash")).toBeInTheDocument();
    });

    // Touch every row with a non-zero total so the submit validates.
    await userEvent.type(screen.getByTestId("Cash"), "1000");
    // Card starts at 0: typing "0" onto the same value fires no change event,
    // so clear it first to make the touch register.
    await userEvent.clear(screen.getByTestId("Card"));
    await userEvent.type(screen.getByTestId("Card"), "0");

    await waitFor(() => {
      expect(
        screen.queryByText("pos_closing.validation_missing_rows")
      ).not.toBeInTheDocument();
    });

    await userEvent.click(
      screen.getByRole("button", { name: "pos_closing.submit" })
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "pos_closing.confirm_submit" })
    );

    // The checklist gate fires BEFORE any closing doc is created.
    await screen.findByRole("button", { name: "Complete Checklist" });
    expect(createPosClosingEntryMock).not.toHaveBeenCalled();
    expect(createSubPosClosingMock).not.toHaveBeenCalled();

    // Completing the checklist resumes the close submission.
    await userEvent.click(
      screen.getByRole("button", { name: "Complete Checklist" })
    );
    await waitFor(() => {
      expect(createPosClosingEntryMock).toHaveBeenCalled();
    });
  });

  it("surfaces a server exception detail (NegativeStockError) instead of the generic fallback", async () => {
    createPosClosingEntryMock.mockResolvedValue({ name: "PCE-1" });
    // Frappe HTTP 500 answers carry `exception` but no `_server_messages`;
    // frappe-js-sdk surfaces it as a plain object, not an Error instance.
    submitPosClosingEntryMock.mockRejectedValue({
      exception:
        "erpnext.stock.stock_ledger.NegativeStockError: 6.0 units of Item BTRSCP: Butter Scotch Scoop needed in Warehouse Direct Retail Warehouse - U to complete this transaction.",
      exc_type: "NegativeStockError",
    });

    render(
      <POSClosingDialog
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("Cash")).toBeInTheDocument();
    });

    // Touch every row so the submit validates.
    await userEvent.type(screen.getByTestId("Cash"), "1000");
    await userEvent.clear(screen.getByTestId("Card"));
    await userEvent.type(screen.getByTestId("Card"), "0");

    await userEvent.click(
      screen.getByRole("button", { name: "pos_closing.submit" })
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "pos_closing.confirm_submit" })
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "Failed to close POS: 6.0 units of Item BTRSCP: Butter Scotch Scoop needed in Warehouse Direct Retail Warehouse - U to complete this transaction."
        )
      ).toBeInTheDocument();
    });
  });
});
