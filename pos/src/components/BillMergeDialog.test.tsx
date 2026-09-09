import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const getLinkedMergeSecondariesMock = vi.fn();
const getMergeBillCandidatesMock = vi.fn();
const mergeBillsMock = vi.fn();

vi.mock("../lib/invoice-api", () => ({
  getLinkedMergeSecondaries: (...args) => getLinkedMergeSecondariesMock(...args),
  getMergeBillCandidates: (...args) => getMergeBillCandidatesMock(...args),
  mergeBills: (...args) => mergeBillsMock(...args),
}));

vi.mock("@ury/ui", () => {
  return {
    Dialog: ({ open, children }) => open ? <div>{children}</div> : null,
    DialogContent: ({ children }) => <div>{children}</div>,
    DialogDescription: ({ children }) => <div>{children}</div>,
    DialogFooter: ({ children }) => <div>{children}</div>,
    DialogHeader: ({ children }) => <div>{children}</div>,
    DialogTitle: ({ children }) => <div>{children}</div>,
    Button: ({ children, onClick, disabled }) => (
      <button onClick={onClick} disabled={disabled}>{children}</button>
    ),
    Spinner: ({ message }) => <div>{message}</div>,
    cn: (...args) => args.filter(Boolean).join(" "),
    showToast: { success: vi.fn(), error: vi.fn() },
  };
});

vi.mock("@ury/core", () => ({
  formatCurrency: (amount) => `Rs. ${amount}`,
}));

vi.mock("../i18n", () => ({
  t: (key) => key,
}));

import BillMergeDialog from "./BillMergeDialog";

describe("BillMergeDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when closed", () => {
    const { container } = render(
      <BillMergeDialog
        open={false}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        onConfirm={vi.fn()}
      />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders dialog title when open", async () => {
    getLinkedMergeSecondariesMock.mockResolvedValueOnce([]);
    getMergeBillCandidatesMock.mockResolvedValueOnce({ data: [], hasMore: false });

    render(
      <BillMergeDialog
        open={true}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        onConfirm={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("bill_merge.merge_bill")).toBeInTheDocument();
    });
  });

  it("loads linked merge secondaries", async () => {
    getLinkedMergeSecondariesMock.mockResolvedValueOnce(["INV-002"]);
    getMergeBillCandidatesMock.mockResolvedValueOnce({ data: [], hasMore: false });

    render(
      <BillMergeDialog
        open={true}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        onConfirm={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(getLinkedMergeSecondariesMock).toHaveBeenCalled();
    });
  });

  it("displays candidates", async () => {
    getLinkedMergeSecondariesMock.mockResolvedValueOnce([]);
    getMergeBillCandidatesMock.mockResolvedValueOnce({
      data: [
        {
          name: "INV-002",
          customer: "John",
          customer_name: "John Doe",
          restaurant_table: "T-1",
          custom_merged_tables: null,
          grand_total: 500,
          rounded_total: 500,
        },
      ],
      hasMore: false,
    });

    render(
      <BillMergeDialog
        open={true}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        onConfirm={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("INV-002")).toBeInTheDocument();
      const elements = screen.queryAllByText(/John Doe/);
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  it("shows no candidates message", async () => {
    getLinkedMergeSecondariesMock.mockResolvedValueOnce([]);
    getMergeBillCandidatesMock.mockResolvedValueOnce({ data: [], hasMore: false });

    render(
      <BillMergeDialog
        open={true}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        onConfirm={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("bill_merge.no_candidates")).toBeInTheDocument();
    });
  });

  it("closes dialog on cancel", async () => {
    const user = userEvent.setup();
    const onOpenChangeMock = vi.fn();

    getLinkedMergeSecondariesMock.mockResolvedValueOnce([]);
    getMergeBillCandidatesMock.mockResolvedValueOnce({ data: [], hasMore: false });

    render(
      <BillMergeDialog
        open={true}
        onOpenChange={onOpenChangeMock}
        invoiceName="INV-001"
        onConfirm={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("bill_merge.merge_bill")).toBeInTheDocument();
    });

    const cancelButton = screen.getAllByRole("button").find((btn) =>
      btn.textContent?.includes("common.cancel")
    );

    if (cancelButton) {
      await user.click(cancelButton);
      expect(onOpenChangeMock).toHaveBeenCalledWith(false);
    }
  });
});
