import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrderTypeSelect from "./OrderTypeSelect";

const mockUsePOSStore = vi.fn();
const mockUseRootStore = vi.fn();

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => mockUsePOSStore(),
}));

vi.mock("../store/root-store", () => ({
  useRootStore: () => mockUseRootStore(),
}));

vi.mock("../lib/table-utils", () => ({
  formatMergedTableLabel: (table: string) => table,
}));

vi.mock("@ury/core", () => ({
  isUserRestrictedFromTableOrders: (user: any, profile: any) => false,
}));

vi.mock("./TableSelectionDialog", () => ({
  default: ({ onClose }: any) => <div data-testid="table-dialog">Table Dialog</div>,
}));

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

describe("OrderTypeSelect", () => {
  beforeEach(() => {
    mockUsePOSStore.mockReturnValue({
      selectedOrderType: "Takeaway",
      setSelectedOrderType: vi.fn(),
      selectedTable: null,
      tableOrder: null,
      posProfile: {},
      isUpdatingOrder: false,
    });

    mockUseRootStore.mockReturnValue({
      user: { name: "user1" },
    });
  });

  it("renders order type buttons", () => {
    render(<OrderTypeSelect />);
    
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("calls setSelectedOrderType when clicking an order type", async () => {
    const user = userEvent.setup();
    const setSelectedOrderType = vi.fn();
    
    mockUsePOSStore.mockReturnValue({
      selectedOrderType: "Takeaway",
      setSelectedOrderType,
      selectedTable: null,
      tableOrder: null,
      posProfile: {},
      isUpdatingOrder: false,
    });

    render(<OrderTypeSelect />);
    
    const buttons = screen.getAllByRole("button");
    if (buttons.length > 0) {
      await user.click(buttons[0]);
      expect(setSelectedOrderType).toHaveBeenCalled();
    }
  });

  it("respects disabled prop", () => {
    render(<OrderTypeSelect disabled={true} />);
    
    const buttons = screen.getAllByRole("button");
    buttons.forEach(button => {
      expect(button).toHaveAttribute("disabled");
    });
  });

  it("disables buttons when isUpdatingOrder is true", () => {
    mockUsePOSStore.mockReturnValue({
      selectedOrderType: "Takeaway",
      setSelectedOrderType: vi.fn(),
      selectedTable: null,
      tableOrder: null,
      posProfile: {},
      isUpdatingOrder: true,
    });

    render(<OrderTypeSelect />);
    
    const buttons = screen.getAllByRole("button");
    buttons.forEach(button => {
      expect(button).toHaveAttribute("disabled");
    });
  });
});
