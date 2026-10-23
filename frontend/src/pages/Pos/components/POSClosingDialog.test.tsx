import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../i18n", () => ({
  t: (key: string) => (key === "pos_closing.submit_failed" ? "Failed to close POS" : key),
}));

// Stable identities: fresh objects per render would re-trigger the
// loadClosingDetails effect on every state change, resetting rows mid-test.
const { mockPosProfile, mockUser } = vi.hoisted(() => ({
  mockPosProfile: {
    name: "POS-001",
    multiple_cashier: 0,
    owner: "test_user",
    branch: "Kozhikode",
    company: "URY",
  },
  mockUser: { name: "test_user", full_name: "Test User" },
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

vi.mock("../lib/pos-closing-api", () => ({
  getOpenPosOpeningEntries: vi.fn().mockResolvedValue([{
    name: "POO-001",
    user: "test_user",
    period_start_date: "2026-09-09 06:00:00",
  }]),
  getMainCashierPosInvoices: vi.fn().mockResolvedValue([]),
  getSubCashierPosInvoices: vi.fn().mockResolvedValue([]),
  createPosClosingEntry: vi.fn().mockResolvedValue({ name: "PCE-001" }),
  submitPosClosingEntry: vi.fn().mockResolvedValue({}),
  createSubPosClosing: vi.fn().mockResolvedValue({ name: "SPC-001" }),
  submitSubPosClosing: vi.fn().mockResolvedValue({}),
}));

vi.mock("@ury/core", () => ({
  call: {
    get: vi.fn(),
  },
  db: {
    getDoc: vi.fn().mockResolvedValue({
      name: "POO-001",
      balance_details: [{ mode_of_payment: "Cash", opening_amount: 1000 }],
    }),
  },
  formatCurrency: (amount: number) => `Rs. ${amount}`,
}));

vi.mock("../../../lib/pos/checklist-api", () => ({
  getChecklist: vi.fn(),
}));

vi.mock("./ClosingPaymentTable", () => ({
  default: ({ rows }: any) => (
    <div data-testid="closing-payment-table">
      {rows.map((row: any) => (
        <div key={row.mode_of_payment}>
          <span>{row.mode_of_payment}</span>
          <span data-testid={`expected-${row.mode_of_payment}`}>
            {row.expected_amount}
          </span>
        </div>
      ))}
    </div>
  ),
}));

vi.mock("./ChecklistGateDialog", () => ({
  default: ({ onComplete }: any) => (
    <div data-testid="checklist-gate-dialog">
      <button onClick={onComplete}>Complete</button>
    </div>
  ),
}));

import POSClosingDialog from "./POSClosingDialog";
import * as checklistApi from "../../../lib/pos/checklist-api";
import * as posClosingApi from "../lib/pos-closing-api";

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  onClosingSubmitted: vi.fn(),
};

describe("POSClosingDialog", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders dialog", async () => {
    render(<POSClosingDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("pos_closing.title")).toBeInTheDocument();
    });
  });

  it("shows loading state", () => {
    render(<POSClosingDialog {...defaultProps} />);
    expect(screen.getByText("pos_closing.loading")).toBeInTheDocument();
  });

  it("loads and displays totals", async () => {
    render(<POSClosingDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("pos_closing.grand_total")).toBeInTheDocument();
    });
  });

  it("renders action buttons", async () => {
    render(<POSClosingDialog {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /common.cancel/i })).toBeInTheDocument();
    });
  });

  it("closes when cancel is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<POSClosingDialog {...defaultProps} onOpenChange={onOpenChange} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /common.cancel/i })).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole("button", { name: /common.cancel/i });
    await user.click(cancelButton);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("computes expected_amount as opening + sales for pre-aggregated payments (ERPNext v16)", async () => {
    // ERPNext v16 get_invoices returns {invoices, payments, taxes} with
    // payments pre-aggregated by mode and change_amount already deducted.
    (posClosingApi.getMainCashierPosInvoices as any).mockResolvedValueOnce({
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

    render(<POSClosingDialog {...defaultProps} />);

    // Opening balance for Cash is 1000 (db.getDoc mock) + 693 sales = 1693.
    // 693 must NOT be reduced again by any change_amount.
    await waitFor(() => {
      expect(screen.getByTestId("expected-Cash")).toHaveTextContent("1693");
    });
  });

  it("computes expected_amount as opening + sales for per-invoice payments", async () => {
    // Legacy shape: bare invoice list; change_amount is deducted client-side
    // when the payment account matches account_for_change_amount.
    (posClosingApi.getMainCashierPosInvoices as any).mockResolvedValueOnce([
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

    render(<POSClosingDialog {...defaultProps} />);

    // Opening 1000 + (1000 payment - 50 change) = 1950.
    await waitFor(() => {
      expect(screen.getByTestId("expected-Cash")).toHaveTextContent("1950");
    });
  });

  it("gates closing submission on a pending Closing checklist before creating the doc", async () => {
    const user = userEvent.setup();
    // First poll: checklist pending (role-based Dependent Checklist goal
    // without a Quality Review). After completion: Complete.
    (checklistApi.getChecklist as any)
      .mockResolvedValueOnce({ logStatus: null })
      .mockResolvedValue({ logStatus: "Complete" });

    render(<POSClosingDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "pos_closing.submit" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "pos_closing.submit" }));

    // The checklist gate fires BEFORE any closing doc is created.
    await waitFor(() => {
      expect(screen.getByTestId("checklist-gate-dialog")).toBeInTheDocument();
    });
    expect(posClosingApi.createPosClosingEntry).not.toHaveBeenCalled();
    expect(posClosingApi.createSubPosClosing).not.toHaveBeenCalled();

    // Completing the checklist resumes the close submission.
    await user.click(screen.getByRole("button", { name: "Complete" }));
    await waitFor(() => {
      expect(posClosingApi.createPosClosingEntry).toHaveBeenCalled();
    });
  });

  it("surfaces a server exception detail (NegativeStockError) instead of the generic fallback", async () => {
    const user = userEvent.setup();
    // Frappe HTTP 500 answers carry `exception` but no `_server_messages`;
    // frappe-js-sdk surfaces it as a plain object, not an Error instance.
    (checklistApi.getChecklist as any).mockResolvedValue({ logStatus: "Complete" });
    (posClosingApi.submitPosClosingEntry as any).mockRejectedValue({
      exception:
        "erpnext.stock.stock_ledger.NegativeStockError: 6.0 units of Item BTRSCP: Butter Scotch Scoop needed in Warehouse Direct Retail Warehouse - U to complete this transaction.",
      exc_type: "NegativeStockError",
    });

    render(<POSClosingDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "pos_closing.submit" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "pos_closing.submit" }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Failed to close POS: 6.0 units of Item BTRSCP: Butter Scotch Scoop needed in Warehouse Direct Retail Warehouse - U to complete this transaction."
        )
      ).toBeInTheDocument();
    });
  });
});
