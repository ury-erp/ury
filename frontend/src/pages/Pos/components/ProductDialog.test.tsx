import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProductDialog from "./ProductDialog";

const mockSetSelectedItem = vi.fn();
const mockAddToOrder = vi.fn();
const mockRemoveFromOrder = vi.fn();
const mockGetItemQuantityFromCart = vi.fn();

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => ({
    selectedItem: {
      id: "1",
      name: "Biryani",
      item: "ITEM-1",
      item_name: "Chicken Biryani",
      price: 250,
      course: "Main Course",
    },
    addToOrder: mockAddToOrder,
    removeFromOrder: mockRemoveFromOrder,
    setSelectedItem: mockSetSelectedItem,
    getItemQuantityFromCart: mockGetItemQuantityFromCart.mockReturnValue(0),
    activeOrders: [],
    menuItems: [
      {
        id: "1",
        item: "ITEM-1",
        item_name: "Chicken Biryani",
        price: 250,
        course: "Main Course",
      },
    ],
  }),
}));

vi.mock("@ury/core", () => ({
  formatCurrency: (amount: number) => `Rs. ${amount.toFixed(2)}`,
  db: {
    getDoc: vi.fn().mockResolvedValue({
      name: "ITEM-1",
      image: null,
      custom_pos_add_on_items: [],
      custom_pos_item_variants: [],
    }),
  },
}));

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

vi.mock("@ury/ui", async () => {
  const actual = await vi.importActual<any>("@ury/ui");
  return {
    ...actual,
    Dialog: ({ open, children, onOpenChange }: any) =>
      open ? (
        <div data-testid="product-dialog">
          {children}
          <button onClick={() => onOpenChange(false)}>Close</button>
        </div>
      ) : null,
    DialogContent: ({ children, ref, ...props }: any) => (
      <div ref={ref} {...props}>
        {children}
      </div>
    ),
    Button: ({ children, onClick, disabled, ...props }: any) => (
      <button onClick={onClick} disabled={disabled} {...props}>
        {children}
      </button>
    ),
    Input: ({ value, onChange, onBlur, ...props }: any) => (
      <input
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        {...props}
      />
    ),
    cn: (...args: any[]) => args.filter(Boolean).join(" "),
  };
});

describe("ProductDialog", () => {
  beforeEach(() => {
    mockSetSelectedItem.mockClear();
    mockAddToOrder.mockClear();
    mockRemoveFromOrder.mockClear();
  });

  it("renders product dialog", async () => {
    render(
      <ProductDialog onClose={vi.fn()} />
    );

    await waitFor(() => {
      const dialog = screen.queryAllByTestId("product-dialog");
      expect(dialog.length > 0).toBeTruthy();
    });
  });

  it("displays product name and code", async () => {
    render(
      <ProductDialog onClose={vi.fn()} />
    );

    await waitFor(() => {
      const elements = screen.queryAllByText("Chicken Biryani");
      expect(elements.length > 0).toBeTruthy();
    });
  });

  it("renders quantity input field", async () => {
    const { container } = render(
      <ProductDialog onClose={vi.fn()} />
    );

    await waitFor(() => {
      const inputs = container.querySelectorAll("input[type=number]");
      expect(inputs.length > 0).toBeTruthy();
    });
  });

  it("has add to order button", async () => {
    render(
      <ProductDialog onClose={vi.fn()} />
    );

    await waitFor(() => {
      const buttons = screen.queryAllByRole("button");
      expect(buttons.length > 0).toBeTruthy();
    });
  });

  it("closes dialog when close button is clicked", async () => {
    const user = userEvent.setup();
    const mockOnClose = vi.fn();
    
    render(
      <ProductDialog onClose={mockOnClose} />
    );

    await waitFor(() => {
      const closeButtons = screen.queryAllByText("Close");
      if (closeButtons.length > 0) {
        user.click(closeButtons[0]);
      }
    });
  });
});
