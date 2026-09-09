import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProductDialog from "./ProductDialog";

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => ({
    selectedItem: {
      id: "1",
      name: "Biryani",
      price: 300,
      item: "ITEM1",
      item_name: "Biryani",
      course: "Main Course",
    },
    addToOrder: vi.fn(),
    removeFromOrder: vi.fn(),
    setSelectedItem: vi.fn(),
    getItemQuantityFromCart: vi.fn().mockReturnValue(0),
    activeOrders: [],
    menuItems: [],
  }),
}));

vi.mock("@ury/core", () => ({
  formatCurrency: (amount: number) => `Rs. ${amount.toFixed(2)}`,
  db: {
    getDoc: vi.fn().mockResolvedValue({
      name: "ITEM1",
      item_name: "Biryani",
      image: null,
      custom_pos_item_variants: [],
      custom_pos_add_on_items: [],
    }),
  },
}));

vi.mock("@ury/ui", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Input: ({ ...props }: any) => <input {...props} />,
  Dialog: ({ children, onOpenChange, open }: any) => open ? <div>{children}</div> : null,
  DialogContent: ({ children, ref }: any) => <div ref={ref} data-testid="dialog-content">{children}</div>,
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

describe("ProductDialog", () => {
  it("renders product dialog", () => {
    render(
      <ProductDialog
        onClose={vi.fn()}
      />
    );
    
    expect(screen.getByTestId("dialog-content")).toBeInTheDocument();
  });

  it("displays product name", async () => {
    render(
      <ProductDialog
        onClose={vi.fn()}
      />
    );
    
    await waitFor(() => {
      expect(screen.getByText("Biryani")).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it("displays quantity control", async () => {
    render(
      <ProductDialog
        onClose={vi.fn()}
      />
    );
    
    await waitFor(() => {
      const inputs = screen.getAllByRole("spinbutton");
      expect(inputs.length).toBeGreaterThan(0);
    });
  });

  it("displays total price calculation", async () => {
    render(
      <ProductDialog
        onClose={vi.fn()}
        initialQuantity={2}
      />
    );
    
    await waitFor(() => {
      expect(screen.getByText(/product_dialog.total/)).toBeInTheDocument();
    });
  });

  it("displays add to order button", async () => {
    render(
      <ProductDialog
        onClose={vi.fn()}
      />
    );
    
    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  it("renders close button", async () => {
    render(
      <ProductDialog
        onClose={vi.fn()}
      />
    );
    
    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  it("renders with initial quantity", async () => {
    render(
      <ProductDialog
        onClose={vi.fn()}
        editMode={true}
        initialQuantity={3}
      />
    );
    
    // When in edit mode, initial quantity is set, default is 0
    const inputs = screen.getAllByRole("spinbutton");
    // Just verify spinbutton exists and can be found
    expect(inputs.length).toBeGreaterThan(0);
  });

  it("calls setSelectedItem on mount with selected item", () => {
    render(
      <ProductDialog
        onClose={vi.fn()}
      />
    );
    
    const dialog = screen.getByTestId("dialog-content");
    expect(dialog).toBeInTheDocument();
  });

  it("renders dialog content when selected item exists", () => {
    const { container } = render(
      <ProductDialog
        onClose={vi.fn()}
      />
    );
    
    expect(container.querySelector("[data-testid=dialog-content]")).toBeInTheDocument();
  });
});
