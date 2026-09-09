import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CaptainOrderLine from "./CaptainOrderLine";
import type { OrderDeltaLine } from "../hooks/useTableOrderContext";

vi.mock("@ury/core", () => ({
  formatCurrency: (amount: number) => `Rs. ${amount}`,
}));

vi.mock("@ury/ui", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

const mockLine: OrderDeltaLine = {
  uniqueId: "1",
  name: "Chicken Biryani",
  price: 250,
  delta: 2,
  confirmedQty: 1,
  curQty: 3,
  baseQty: 1,
  comment: "Extra spicy",
};

describe("CaptainOrderLine", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders a confirmed order line with quantity", () => {
    render(
      <CaptainOrderLine
        line={mockLine}
        variant="confirmed"
      />
    );
    expect(screen.getByText(/Chicken Biryani/)).toBeInTheDocument();
    expect(screen.getByText(/Rs. 250/)).toBeInTheDocument();
  });

  it("renders a delta order line with plus sign", () => {
    render(
      <CaptainOrderLine
        line={mockLine}
        variant="delta"
      />
    );
    const text = screen.getByText(/Chicken Biryani/).textContent;
    expect(text).toContain("2");
  });

  it("renders a reduction order line with minus sign", () => {
    render(
      <CaptainOrderLine
        line={mockLine}
        variant="reduction"
      />
    );
    expect(screen.getByText(/Chicken Biryani/)).toBeInTheDocument();
  });

  it("displays item comment when present", () => {
    render(
      <CaptainOrderLine
        line={mockLine}
        variant="confirmed"
      />
    );
    expect(screen.getByText(/Extra spicy/)).toBeInTheDocument();
  });

  it("does not display comment when not present", () => {
    const lineWithoutComment: OrderDeltaLine = {
      ...mockLine,
      comment: "",
    };
    render(
      <CaptainOrderLine
        line={lineWithoutComment}
        variant="confirmed"
      />
    );
    expect(screen.queryByText(/Extra spicy/)).not.toBeInTheDocument();
  });

  it("shows increment and decrement buttons for delta variant", () => {
    render(
      <CaptainOrderLine
        line={mockLine}
        variant="delta"
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /increase/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /decrease/i })).toBeInTheDocument();
  });

  it("calls onIncrement when increment button is clicked", async () => {
    const onIncrement = vi.fn();
    const user = userEvent.setup();

    render(
      <CaptainOrderLine
        line={mockLine}
        variant="delta"
        onIncrement={onIncrement}
        onDecrement={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /increase/i }));
    expect(onIncrement).toHaveBeenCalled();
  });

  it("calls onDecrement when decrement button is clicked", async () => {
    const onDecrement = vi.fn();
    const user = userEvent.setup();

    render(
      <CaptainOrderLine
        line={mockLine}
        variant="delta"
        onIncrement={vi.fn()}
        onDecrement={onDecrement}
      />
    );

    await user.click(screen.getByRole("button", { name: /decrease/i }));
    expect(onDecrement).toHaveBeenCalled();
  });

  it("shows reduce button for confirmed variant", () => {
    render(
      <CaptainOrderLine
        line={mockLine}
        variant="confirmed"
        onDecrement={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /reduce quantity/i })).toBeInTheDocument();
  });

  it("shows remove button for confirmed variant", () => {
    render(
      <CaptainOrderLine
        line={mockLine}
        variant="confirmed"
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /remove item/i })).toBeInTheDocument();
  });

  it("shows restore button for reduction variant", () => {
    render(
      <CaptainOrderLine
        line={mockLine}
        variant="reduction"
        onRestore={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /undo reduction/i })).toBeInTheDocument();
  });

  it("disables buttons when disabled prop is true", () => {
    render(
      <CaptainOrderLine
        line={mockLine}
        variant="delta"
        disabled={true}
        onIncrement={vi.fn()}
        onDecrement={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /increase/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /decrease/i })).toBeDisabled();
  });

  it("calls onEditNote when line content is clicked", async () => {
    const onEditNote = vi.fn();
    const user = userEvent.setup();

    render(
      <CaptainOrderLine
        line={mockLine}
        variant="confirmed"
        onEditNote={onEditNote}
      />
    );

    const itemText = screen.getByText(/Chicken Biryani/);
    await user.click(itemText);
    expect(onEditNote).toHaveBeenCalled();
  });

  it("displays correct currency format for price", () => {
    render(
      <CaptainOrderLine
        line={mockLine}
        variant="confirmed"
      />
    );
    expect(screen.getByText(/Rs\. 250/)).toBeInTheDocument();
  });
});
