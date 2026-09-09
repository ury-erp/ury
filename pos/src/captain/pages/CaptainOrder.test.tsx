import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import CaptainOrder from "./CaptainOrder";

vi.mock("../hooks/useTableOrderContext", () => ({
  useTableOrderContext: () => ({
    context: null,
    permissions: null,
    isContextLoading: true,
    contextError: null,
    isOrderReady: false,
    alreadyOrderedLines: [],
    newOrChangedLines: [],
    reductionPendingLines: [],
  }),
}));

vi.mock("../../store/pos-store", () => ({
  usePOSStore: () => ({
    activeOrders: [],
    removeFromOrder: vi.fn(),
    updateQuantity: vi.fn(),
    updateItemComment: vi.fn(),
    setSelectedItem: vi.fn(),
    isUpdatingOrder: false,
    orderId: null,
    posProfile: null,
    paymentModes: [],
    orderComment: "",
    noOfPax: 1,
    setNoOfPax: vi.fn(),
    lastModifiedTime: null,
    selectedRoom: "",
    selectedCustomer: null,
    clearTableOrder: vi.fn(),
    isOrderInteractionDisabled: () => false,
  }),
}));

vi.mock("../../store/root-store", () => ({
  useRootStore: () => ({ user: { name: "user1" } }),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ table: "T1" }),
}));

vi.mock("../../lib/order-api", () => ({
  syncOrder: vi.fn(),
  reprintKot: vi.fn(),
  tableTransfer: vi.fn(),
  captainTransfer: vi.fn(),
}));

vi.mock("../../lib/print", () => ({ printOrder: vi.fn() }));
vi.mock("../../lib/invoice-api", () => ({ resolvePrintFormat: vi.fn(() => "default") }));
vi.mock("../../lib/table-api", () => ({ getVacantTablesForBranch: vi.fn() }));

vi.mock("@ury/ui", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Spinner: ({ message }: any) => <div>{message}</div>,
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
  showToast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@ury/core", () => ({ formatCurrency: (amount: number) => `Rs. ${amount}` }));

vi.mock("../components/CaptainMenu", () => ({ default: () => <div>Menu</div> }));
vi.mock("../components/CaptainOrderLine", () => ({ default: () => <div>Line</div> }));
vi.mock("../components/CaptainActionsMenu", () => ({ default: () => <div>Actions</div> }));
vi.mock("../../components/ProductDialog", () => ({ default: () => null }));
vi.mock("../../components/CommentDialog", () => ({ default: () => null }));
vi.mock("../../components/TableTransferDialog", () => ({ default: () => null }));
vi.mock("../../components/CaptainTransferDialog", () => ({ default: () => null }));
vi.mock("../../components/CustomerSelect", () => ({ CustomerSelect: () => null }));

describe("CaptainOrder", () => {
  it("renders loading state", () => {
    render(<CaptainOrder />);
    expect(screen.getByText(/Loading table/)).toBeInTheDocument();
  });
});
