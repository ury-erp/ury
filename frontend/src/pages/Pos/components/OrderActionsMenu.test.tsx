import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrderActionsMenu from "./OrderActionsMenu";

vi.mock("../i18n", () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      "order.order_actions": "Order Actions",
      "bill_merge.merge_bill": "Merge Bill",
      "bill_split.split_bill": "Split Bill",
    };
    return translations[key] || key;
  },
}));

describe("OrderActionsMenu", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders nothing when both showSplitBill and showMergeBill are false", () => {
    const { container } = render(
      <OrderActionsMenu
        isOpen={false}
        onOpenChange={vi.fn()}
        showSplitBill={false}
        showMergeBill={false}
      />
    );
    
    expect(container.firstChild).toBeNull();
  });

  it("renders menu button when showMergeBill is true", () => {
    render(
      <OrderActionsMenu
        isOpen={false}
        onOpenChange={vi.fn()}
        showMergeBill={true}
      />
    );
    
    const button = screen.getByRole("button", { name: /Order Actions/i });
    expect(button).toBeInTheDocument();
  });

  it("toggles menu open state on button click", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    
    render(
      <OrderActionsMenu
        isOpen={false}
        onOpenChange={onOpenChange}
        showMergeBill={true}
      />
    );
    
    const button = screen.getByRole("button", { name: /Order Actions/i });
    await user.click(button);
    
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("displays menu items when isOpen is true", () => {
    render(
      <OrderActionsMenu
        isOpen={true}
        onOpenChange={vi.fn()}
        showMergeBill={true}
        showSplitBill={true}
      />
    );
    
    expect(screen.getByText("Merge Bill")).toBeInTheDocument();
    expect(screen.getByText("Split Bill")).toBeInTheDocument();
  });

  it("calls onMergeBill when merge bill is clicked", async () => {
    const onMergeBill = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    
    render(
      <OrderActionsMenu
        isOpen={true}
        onOpenChange={onOpenChange}
        showMergeBill={true}
        onMergeBill={onMergeBill}
      />
    );
    
    const mergeButton = screen.getByText("Merge Bill");
    await user.click(mergeButton);
    
    expect(onMergeBill).toHaveBeenCalled();
  });

  it("calls onSplitBill when split bill is clicked", async () => {
    const onSplitBill = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    
    render(
      <OrderActionsMenu
        isOpen={true}
        onOpenChange={onOpenChange}
        showSplitBill={true}
        onSplitBill={onSplitBill}
      />
    );
    
    const splitButton = screen.getByText("Split Bill");
    await user.click(splitButton);
    
    expect(onSplitBill).toHaveBeenCalled();
  });

  it("closes menu after action button click", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    
    render(
      <OrderActionsMenu
        isOpen={true}
        onOpenChange={onOpenChange}
        showMergeBill={true}
      />
    );
    
    const mergeButton = screen.getByText("Merge Bill");
    await user.click(mergeButton);
    
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes menu on outside click", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    
    const { container } = render(
      <div>
        <div data-testid="outside">Outside element</div>
        <OrderActionsMenu
          isOpen={true}
          onOpenChange={onOpenChange}
          showMergeBill={true}
        />
      </div>
    );
    
    const outside = screen.getByTestId("outside");
    await user.click(outside);
    
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("has aria-expanded attribute set correctly", () => {
    const { rerender } = render(
      <OrderActionsMenu
        isOpen={false}
        onOpenChange={vi.fn()}
        showMergeBill={true}
      />
    );
    
    let button = screen.getByRole("button", { name: /Order Actions/i });
    expect(button).toHaveAttribute("aria-expanded", "false");
    
    rerender(
      <OrderActionsMenu
        isOpen={true}
        onOpenChange={vi.fn()}
        showMergeBill={true}
      />
    );
    
    button = screen.getByRole("button", { name: /Order Actions/i });
    expect(button).toHaveAttribute("aria-expanded", "true");
  });
});
