import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => ({
    posProfile: {
      name: "POS-001",
      multiple_cashier: 0,
      owner: "test_user",
      branch: "Kozhikode",
      company: "URY",
    },
  }),
}));

vi.mock("../store/root-store", () => ({
  useRootStore: () => ({
    user: { name: "test_user", full_name: "Test User" },
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
        <div key={row.mode_of_payment}>{row.mode_of_payment}</div>
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
});
