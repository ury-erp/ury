import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
    posProfile: {
      name: "POS-1",
      company: "Test Company",
      owner: "test_user",
      multiple_cashier: 0,
    },
  }),
}));

vi.mock("../store/root-store", () => ({
  useRootStore: () => ({
    user: {
      name: "test_user",
      full_name: "Test User",
    },
  }),
}));

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

vi.mock("./ClosingPaymentTable", () => ({
  default: ({ rows, onChange }: any) => (
    <div>
      {rows.map((row: any) => (
        <div key={row.mode_of_payment}>
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
});
