import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserRouter } from "react-router-dom";
import CaptainOrder from "./CaptainOrder";

const mockUseTableOrderContext = vi.fn();
const mockUsePOSStore = vi.fn();
const mockUseRootStore = vi.fn();

vi.mock("../hooks/useTableOrderContext", () => ({
  useTableOrderContext: () => mockUseTableOrderContext(),
}));

vi.mock("../../store/pos-store", () => ({
  usePOSStore: () => mockUsePOSStore(),
}));

vi.mock("../../store/root-store", () => ({
  useRootStore: (selector: any) => mockUseRootStore(selector),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ table: "Table-5" }),
    useNavigate: () => vi.fn(),
  };
});

vi.mock("../../lib/order-api", () => ({
  syncOrder: vi.fn().mockResolvedValue({ message: { status: "Success" } }),
  reprintKot: vi.fn().mockResolvedValue({}),
  tableTransfer: vi.fn().mockResolvedValue({}),
  captainTransfer: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../lib/print", () => ({
  printOrder: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../lib/invoice-api", () => ({
  resolvePrintFormat: vi.fn().mockReturnValue("Standard"),
}));

vi.mock("../../lib/table-api", () => ({
  getVacantTablesForBranch: vi.fn().mockResolvedValue([]),
}));

vi.mock("@ury/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ury/ui")>();
  return {
    ...actual,
    Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    Spinner: ({ message }: { message: string }) => (
      <div data-testid="spinner">{message}</div>
    ),
    cn: (...args: any[]) => args.filter(Boolean).join(" "),
    showToast: {
      error: vi.fn(),
      success: vi.fn(),
    },
  };
});

vi.mock("@ury/core", () => ({
  formatCurrency: (amount: number) => `Rs. ${amount}`,
  call: vi.fn().mockResolvedValue({}),
}));

vi.mock("../components/CaptainMenu", () => ({
  default: () => <div data-testid="captain-menu">Menu</div>,
}));

vi.mock("../components/CaptainOrderLine", () => ({
  default: () => <div data-testid="order-line">Order Line</div>,
}));

vi.mock("../components/CaptainActionsMenu", () => ({
  default: () => <div data-testid="actions-menu">Actions</div>,
}));

vi.mock("../../components/ProductDialog", () => ({
  default: () => <div data-testid="product-dialog">Product</div>,
}));

vi.mock("../../components/CommentDialog", () => ({
  default: () => <div data-testid="comment-dialog">Comment</div>,
}));

vi.mock("../../components/TableTransferDialog", () => ({
  default: () => <div data-testid="table-transfer-dialog">Transfer</div>,
}));

vi.mock("../../components/CaptainTransferDialog", () => ({
  default: () => <div data-testid="captain-transfer-dialog">Captain</div>,
}));

vi.mock("../../components/CustomerSelect", () => ({
  CustomerSelect: () => <div data-testid="customer-select">Customer</div>,
}));

const mockContext = {
  order: { name: "INV-001" },
  assignment: { waiter: "user123" },
  permissions: {
    view: true,
    modify: true,
    reduce_items: true,
    remove_items: true,
    reprint_kot: true,
    transfer_table: true,
    transfer_captain: true,
    print_bill: true,
  },
};

const mockPOSStore = {
  activeOrders: [],
  removeFromOrder: vi.fn(),
  updateQuantity: vi.fn(),
  updateItemComment: vi.fn(),
  setSelectedItem: vi.fn(),
  isUpdatingOrder: false,
  orderId: null,
  posProfile: { name: "POS-1", branch: "Kozhikode", cashier: "cashier1", owner: "owner1", print_format: "Standard" },
  paymentModes: ["Cash"],
  orderComment: "",
  noOfPax: 4,
  setNoOfPax: vi.fn(),
  lastModifiedTime: null,
  selectedRoom: null,
  selectedCustomer: { name: "CUST-001" },
  clearTableOrder: vi.fn(),
  isOrderInteractionDisabled: () => false,
};

describe("CaptainOrder", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockUseTableOrderContext.mockReturnValue({
      context: mockContext,
      permissions: mockContext.permissions,
      isContextLoading: false,
      contextError: null,
      isOrderReady: true,
      alreadyOrderedLines: [],
      newOrChangedLines: [],
      reductionPendingLines: [],
    });
    mockUsePOSStore.mockReturnValue(mockPOSStore);
    mockUseRootStore.mockReturnValue({ name: "user123" });
  });

  it("renders the order page with menu initially for free table", () => {
    render(
      <BrowserRouter>
        <CaptainOrder />
      </BrowserRouter>
    );

    const menus = screen.getAllByTestId("captain-menu");
    expect(menus.length > 0).toBe(true);
  });

  it("shows loading state while context is loading", () => {
    mockUseTableOrderContext.mockReturnValue({
      context: null,
      permissions: null,
      isContextLoading: true,
      contextError: null,
      isOrderReady: false,
      alreadyOrderedLines: [],
      newOrChangedLines: [],
      reductionPendingLines: [],
    });

    render(
      <BrowserRouter>
        <CaptainOrder />
      </BrowserRouter>
    );

    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });

  it("renders order view when table already has items", () => {
    mockUseTableOrderContext.mockReturnValue({
      context: mockContext,
      permissions: mockContext.permissions,
      isContextLoading: false,
      contextError: null,
      isOrderReady: true,
      alreadyOrderedLines: [
        {
          uniqueId: "1",
          name: "Biryani",
          price: 250,
          delta: 0,
          confirmedQty: 2,
          curQty: 2,
          baseQty: 2,
          comment: "",
        },
      ],
      newOrChangedLines: [],
      reductionPendingLines: [],
    });

    render(
      <BrowserRouter>
        <CaptainOrder />
      </BrowserRouter>
    );

    const orderLines = screen.getAllByTestId("order-line");
    expect(orderLines.length > 0).toBe(true);
  });

  it("renders actions menu", () => {
    render(
      <BrowserRouter>
        <CaptainOrder />
      </BrowserRouter>
    );

    const actionMenus = screen.queryAllByTestId("actions-menu");
    expect(actionMenus.length > 0).toBe(true);
  });

  it("renders without crashing on loading", () => {
    render(
      <BrowserRouter>
        <CaptainOrder />
      </BrowserRouter>
    );

    const menus = screen.queryAllByTestId("captain-menu");
    expect(menus.length > 0).toBe(true);
  });

  it("denies access when view permission is false", () => {
    mockUseTableOrderContext.mockReturnValue({
      context: mockContext,
      permissions: { view: false },
      isContextLoading: false,
      contextError: null,
      isOrderReady: true,
      alreadyOrderedLines: [],
      newOrChangedLines: [],
      reductionPendingLines: [],
    });

    render(
      <BrowserRouter>
        <CaptainOrder />
      </BrowserRouter>
    );

    const menus = screen.queryAllByTestId("captain-menu");
    expect(menus.length === 0).toBe(true);
  });
});
