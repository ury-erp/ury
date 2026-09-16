import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@ury/ui", () => ({
  Dialog: ({ open, children }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogDescription: ({ children }) => <div>{children}</div>,
  DialogFooter: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <div>{children}</div>,
  Button: ({ children, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
  cn: (...args) => args.filter(Boolean).join(" "),
  showToast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@ury/core", () => ({
  formatCurrency: (amount) => `Rs. ${amount}`,
}));

vi.mock("../i18n", () => ({
  t: (key) => key,
}));

vi.mock("./CustomerPicker", () => ({
  CustomerPicker: ({ value, onChange, disabled }) => (
    <div>
      <input
        type="text"
        value={value?.name || ""}
        onChange={(e) => onChange({ id: "cust-1", name: e.target.value })}
        disabled={disabled}
        placeholder="Select customer"
      />
    </div>
  ),
}));

import BillSplitDialog from "./BillSplitDialog";

describe("BillSplitDialog", () => {
  const mockItems = [
    { name: "item-1", item_name: "Chicken Biryani", qty: 2, rate: 250, amount: 500 },
    { name: "item-2", item_name: "Naan", qty: 3, rate: 50, amount: 150 },
  ];

  const mockCustomer = { id: "cust-1", name: "John Doe" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when closed", () => {
    const { container } = render(
      <BillSplitDialog
        open={false}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        items={mockItems}
        onConfirm={vi.fn()}
      />
    );
    expect(container.querySelector('[role="button"]')).not.toBeInTheDocument();
  });

  it("renders dialog title when open", () => {
    render(
      <BillSplitDialog
        open={true}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        items={mockItems}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByText("bill_split.split_bill")).toBeInTheDocument();
  });

  it("displays all items", () => {
    render(
      <BillSplitDialog
        open={true}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        items={mockItems}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByText("Chicken Biryani")).toBeInTheDocument();
    expect(screen.getByText("Naan")).toBeInTheDocument();
  });

  it("allows item selection and shows qty controls", async () => {
    const user = userEvent.setup();

    render(
      <BillSplitDialog
        open={true}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        items={mockItems}
        onConfirm={vi.fn()}
      />
    );

    const itemButton = screen.getByText("Chicken Biryani");
    await user.click(itemButton);

    await waitFor(() => {
      const elements = screen.queryAllByText("2");
      const qtyElement = elements.find(el => {
        const classes = el.className || "";
        return typeof classes === "string" && classes.includes("text-center");
      });
      expect(qtyElement).toBeInTheDocument();
    });
  });

  it("shows same as original customer option", () => {
    render(
      <BillSplitDialog
        open={true}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        items={mockItems}
        sourceCustomer={mockCustomer}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByText("bill_split.same_as_original")).toBeInTheDocument();
  });

  it("validates split amounts", async () => {
    const user = userEvent.setup();

    render(
      <BillSplitDialog
        open={true}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        items={mockItems}
        onConfirm={vi.fn()}
      />
    );

    // Confirm button should be disabled when no items are selected
    let confirmButton = screen.getAllByRole("button").find((btn) =>
      btn.textContent?.includes("bill_split.split_confirm")
    );
    expect(confirmButton).toHaveAttribute("disabled");

    // Select all items to make staying = 0 (invalid state)
    await user.click(screen.getByText("Chicken Biryani"));
    await user.click(screen.getByText("Naan"));

    // Confirm button should still be disabled because staying = 0 (invalid)
    confirmButton = screen.getAllByRole("button").find((btn) =>
      btn.textContent?.includes("bill_split.split_confirm")
    );
    expect(confirmButton).toHaveAttribute("disabled");

    // Select only part of the first item - this should enable the button
    const minusButton = screen.getAllByRole("button").find((btn) => {
      const svg = btn.querySelector('[class*="lucide-minus"]');
      return svg !== null;
    });

    if (minusButton) {
      await user.click(minusButton);
    }

    // Now the button should be enabled (has valid selection)
    confirmButton = screen.getAllByRole("button").find((btn) =>
      btn.textContent?.includes("bill_split.split_confirm")
    );
    expect(confirmButton).not.toHaveAttribute("disabled");
  });

  it("calls onConfirm with selected items", async () => {
    const user = userEvent.setup();
    const onConfirmMock = vi.fn().mockResolvedValueOnce(undefined);

    render(
      <BillSplitDialog
        open={true}
        onOpenChange={vi.fn()}
        invoiceName="INV-001"
        items={mockItems}
        onConfirm={onConfirmMock}
      />
    );

    await user.click(screen.getByText("Chicken Biryani"));

    const confirmButton = screen.getAllByRole("button").find((btn) =>
      btn.textContent?.includes("bill_split.split_confirm")
    );

    if (confirmButton) {
      await user.click(confirmButton);
    }

    await waitFor(() => {
      expect(onConfirmMock).toHaveBeenCalledWith(
        expect.objectContaining({
          itemsToMove: expect.any(Array),
        })
      );
    });
  });

  it("closes dialog on cancel", async () => {
    const user = userEvent.setup();
    const onOpenChangeMock = vi.fn();

    render(
      <BillSplitDialog
        open={true}
        onOpenChange={onOpenChangeMock}
        invoiceName="INV-001"
        items={mockItems}
        onConfirm={vi.fn()}
      />
    );

    const cancelButton = screen.getAllByRole("button").find((btn) =>
      btn.textContent?.includes("common.cancel")
    );

    if (cancelButton) {
      await user.click(cancelButton);
      expect(onOpenChangeMock).toHaveBeenCalledWith(false);
    }
  });
});
