import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import Table from "./Table";

// Mock the API calls
const getRoomsMock = vi.fn();
const getTablesMock = vi.fn();
const getTableCountMock = vi.fn();
vi.mock("../lib/table-api", () => ({
  getRooms: (...args: any[]) => getRoomsMock(...args),
  getTables: (...args: any[]) => getTablesMock(...args),
  getTableCount: (...args: any[]) => getTableCountMock(...args),
  getVacantTablesForBranch: vi.fn().mockResolvedValue([]),
  mergeTablesBatch: vi.fn().mockResolvedValue(undefined),
  unmergeTables: vi.fn().mockResolvedValue(undefined),
}));

// Mock table utilities
vi.mock("../lib/table-utils", () => ({
  getMergeGroupMembers: vi.fn(() => []),
  formatMergedTableLabelFromGroup: vi.fn(() => ""),
  getTableRenderGroups: (tables: any[]) => tables.map((t) => [t]),
  sortTablesByMergeGroups: (tables: any[]) => tables,
}));

// Mock order API
vi.mock("../lib/order-api", () => ({
  getTableOrder: vi.fn().mockResolvedValue({ message: null }),
  captainTransfer: vi.fn().mockResolvedValue(undefined),
  tableTransfer: vi.fn().mockResolvedValue(undefined),
}));

// Mock print API
vi.mock("../lib/print", () => ({
  printOrder: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/invoice-api", () => ({
  resolvePrintFormat: vi.fn(() => "Thermal"),
}));

// Mock stores
const mockPosStore = {
  posProfile: { name: "POS-001", branch: "Kozhikode", print_format: "Thermal" },
  setSelectedTable: vi.fn(),
  setSelectedOrderType: vi.fn(),
};

const mockRootStore = {
  user: { name: "user1", roles: [] },
};

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => mockPosStore,
}));

vi.mock("../store/root-store", () => ({
  useRootStore: () => mockRootStore,
}));

// Mock react-router-dom
const navigateMock = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
}));

// Mock core functions
vi.mock("@ury/core", () => ({
  formatCurrency: (amount: number) => `Rs. ${amount}`,
  canCaptainTransfer: vi.fn(() => false),
  isUserRestrictedFromTableOrders: vi.fn(() => false),
}));

// Mock UI components
vi.mock("@ury/ui", () => ({
  Spinner: () => <div data-testid="spinner">Loading...</div>,
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Badge: ({ children }: any) => <span data-testid="badge">{children}</span>,
  showToast: {
    success: vi.fn(),
    error: vi.fn(),
  },
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
}));

// Mock dialog components
vi.mock("../components/TableMergeDialog", () => ({
  default: () => <div data-testid="merge-dialog" />,
}));

vi.mock("../components/TableUnmergeDialog", () => ({
  default: () => <div data-testid="unmerge-dialog" />,
}));

vi.mock("../components/TableTransferDialog", () => ({
  default: () => <div data-testid="transfer-dialog" />,
}));

vi.mock("../components/CaptainTransferDialog", () => ({
  default: () => <div data-testid="captain-transfer-dialog" />,
}));

vi.mock("../components/TableCard", () => ({
  default: ({ table, onNavigate }: any) => (
    <div data-testid={`table-${table.name}`} onClick={onNavigate}>
      {table.name}
    </div>
  ),
  TABLE_STATE_STYLES: {},
}));

vi.mock("../components/LayoutView", () => ({
  default: () => <div data-testid="layout-view" />,
}));

vi.mock("../components/MergeLinkConnector", () => ({
  default: () => null,
}));

// Mock i18n
vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

// Mock data constants
vi.mock("../data/order-types", () => ({
  DINE_IN: "DINE_IN",
}));

describe("Table View", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRoomsMock.mockResolvedValue([
      { name: "Main Hall", branch: "Kozhikode" },
      { name: "VIP", branch: "Kozhikode" },
    ]);
    getTableCountMock.mockResolvedValue(5);
    getTablesMock.mockResolvedValue([
      { name: "T1", occupied: 0, restaurant_room: "Main Hall" },
      { name: "T2", occupied: 1, restaurant_room: "Main Hall" },
    ]);
  });

  it("renders the table view page", async () => {
    render(<Table />);

    await waitFor(() => {
      expect(screen.getByText("Main Hall")).toBeInTheDocument();
    });
  });

  it("shows loading spinner while fetching rooms", () => {
    getRoomsMock.mockImplementationOnce(() => new Promise(() => {})); // Never resolves

    render(<Table />);

    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });

  it("displays rooms as tab buttons", async () => {
    render(<Table />);

    await waitFor(() => {
      expect(screen.getByText("Main Hall")).toBeInTheDocument();
      expect(screen.getByText("VIP")).toBeInTheDocument();
    });
  });

  it("displays room table count as badge", async () => {
    render(<Table />);

    await waitFor(() => {
      const badges = screen.getAllByTestId("badge");
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  it("loads tables when a room is selected", async () => {
    render(<Table />);

    await waitFor(() => {
      expect(screen.getByTestId("table-T1")).toBeInTheDocument();
      expect(screen.getByTestId("table-T2")).toBeInTheDocument();
    });
  });

  it("shows loading spinner while fetching tables", async () => {
    getTablesMock.mockImplementationOnce(() => new Promise(() => {})); // Never resolves

    render(<Table />);

    await waitFor(() => {
      expect(screen.queryByTestId("spinner")).toBeInTheDocument();
    });
  });

  it("handles table navigation", async () => {
    const user = userEvent.setup();
    render(<Table />);

    await waitFor(() => {
      expect(screen.getByTestId("table-T1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("table-T1"));

    expect(mockPosStore.setSelectedTable).toHaveBeenCalledWith("T1", "Main Hall");
    expect(mockPosStore.setSelectedOrderType).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith("/register");
  });

  it("displays layout view button", async () => {
    render(<Table />);

    await waitFor(() => {
      const layoutButton = screen.getByText(/layout_view/i);
      expect(layoutButton).toBeInTheDocument();
    });
  });

  it("shows merge dialog component", async () => {
    render(<Table />);

    await waitFor(() => {
      expect(screen.getByTestId("merge-dialog")).toBeInTheDocument();
    });
  });

  it("shows transfer dialog component", async () => {
    render(<Table />);

    await waitFor(() => {
      expect(screen.getByTestId("transfer-dialog")).toBeInTheDocument();
    });
  });

  it("shows empty state when no tables found", async () => {
    getTablesMock.mockResolvedValueOnce([]);

    render(<Table />);

    await waitFor(() => {
      expect(screen.getByText(/tables.no_tables_found/i)).toBeInTheDocument();
    });
  });
});
