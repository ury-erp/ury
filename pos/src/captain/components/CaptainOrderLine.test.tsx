import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CaptainOrderLine from "./CaptainOrderLine";
import type { OrderDeltaLine } from "../hooks/useTableOrderContext";

vi.mock("@ury/ui", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@ury/core", () => ({
  formatCurrency: (amount: number) => `Rs. ${amount}`,
}));

const mockLine: OrderDeltaLine = {
  uniqueId: "1",
  name: "Chicken Biryani",
  price: 250,
  comment: "No onions",
  delta: 2,
  confirmedQty: 1,
  curQty: 3,
  baseQty: 1,
};

describe("CaptainOrderLine", () => {
  it("renders delta variant with increment/decrement buttons", () => {
    render(<CaptainOrderLine line={mockLine} variant="delta" onIncrement={vi.fn()} onDecrement={vi.fn()} />);
    expect(screen.getByLabelText("Increase")).toBeInTheDocument();
    expect(screen.getByLabelText("Decrease")).toBeInTheDocument();
  });

  it("displays item name and price", () => {
    render(<CaptainOrderLine line={mockLine} variant="confirmed" />);
    expect(screen.getByText(/Chicken Biryani/)).toBeInTheDocument();
    expect(screen.getByText(/Rs\. 250/)).toBeInTheDocument();
  });

  it("displays comment when present", () => {
    render(<CaptainOrderLine line={mockLine} variant="confirmed" />);
    expect(screen.getByText("No onions")).toBeInTheDocument();
  });

  it("hides comment when not present", () => {
    const lineWithoutComment = { ...mockLine, comment: "" };
    render(<CaptainOrderLine line={lineWithoutComment} variant="confirmed" />);
    expect(screen.queryByText("No onions")).not.toBeInTheDocument();
  });

  it("calls onIncrement when increment button clicked", async () => {
    const onIncrement = vi.fn();
    render(<CaptainOrderLine line={mockLine} variant="delta" onIncrement={onIncrement} />);
    await userEvent.click(screen.getByLabelText("Increase"));
    expect(onIncrement).toHaveBeenCalled();
  });

  it("renders minus button for confirmed variant", () => {
    render(<CaptainOrderLine line={mockLine} variant="confirmed" onDecrement={vi.fn()} />);
    expect(screen.getByLabelText("Reduce quantity")).toBeInTheDocument();
  });

  it("renders trash button for confirmed variant", () => {
    render(<CaptainOrderLine line={mockLine} variant="confirmed" onRemove={vi.fn()} />);
    expect(screen.getByLabelText("Remove item")).toBeInTheDocument();
  });

  it("renders undo button for reduction variant", () => {
    render(<CaptainOrderLine line={mockLine} variant="reduction" onRestore={vi.fn()} />);
    expect(screen.getByLabelText("Undo reduction")).toBeInTheDocument();
  });

  it("disables buttons when disabled prop is true", () => {
    render(
      <CaptainOrderLine line={mockLine} variant="delta" disabled={true} onIncrement={vi.fn()} />
    );
    expect(screen.getByLabelText("Increase")).toBeDisabled();
  });

  it("applies blue background for delta variant", () => {
    const { container } = render(<CaptainOrderLine line={mockLine} variant="delta" />);
    const lineDiv = container.firstChild;
    expect(lineDiv).toHaveClass("bg-blue-50");
  });

  it("applies red background for reduction variant", () => {
    const { container } = render(<CaptainOrderLine line={mockLine} variant="reduction" />);
    const lineDiv = container.firstChild;
    expect(lineDiv).toHaveClass("bg-red-50");
  });

  it("applies white background for confirmed variant", () => {
    const { container } = render(<CaptainOrderLine line={mockLine} variant="confirmed" />);
    const lineDiv = container.firstChild;
    expect(lineDiv).toHaveClass("bg-white");
  });

  it("calls onEditNote when line is clicked", async () => {
    const onEditNote = vi.fn();
    render(<CaptainOrderLine line={mockLine} variant="confirmed" onEditNote={onEditNote} />);
    const lineContent = screen.getByText(/Chicken Biryani/);
    await userEvent.click(lineContent);
    expect(onEditNote).toHaveBeenCalled();
  });
});
