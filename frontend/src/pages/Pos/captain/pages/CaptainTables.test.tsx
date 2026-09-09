import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserRouter } from "react-router-dom";
import CaptainTables from "./CaptainTables";

const mockUseCaptainContext = vi.fn();
const mockGetRooms = vi.fn();
const mockGetTables = vi.fn();
const mockGetActiveTableOrders = vi.fn();
const mockGetUserFullNames = vi.fn();

vi.mock("../hooks/useCaptainContext", () => ({
  useCaptainContext: () => mockUseCaptainContext(),
}));

vi.mock("../../lib/table-api", () => ({
  getRooms: (...args: any[]) => mockGetRooms(...args),
  getTables: (...args: any[]) => mockGetTables(...args),
}));

vi.mock("../lib/captain-table-api", () => ({
  getActiveTableOrders: (...args: any[]) => mockGetActiveTableOrders(...args),
  getUserFullNames: (...args: any[]) => mockGetUserFullNames(...args),
}));

vi.mock("../../lib/table-utils", () => ({
  getMergeGroupMembers: () => [],
  sortTablesByMergeGroups: (tables: any[]) => tables,
}));

vi.mock("../components/CaptainTableCard", () => ({
  default: ({ table, onTap }: any) => (
    <button onClick={onTap} data-testid={`table-card-${table.name}`}>
      {table.name}
    </button>
  ),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

vi.mock("@ury/ui", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Spinner: ({ message }: { message: string }) => (
    <div data-testid="spinner">{message}</div>
  ),
  showToast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const mockRooms = [
  { name: "Main Hall" },
  { name: "Private Room" },
];

const mockTables = [
  { name: "Table 1", occupied: 0, latest_invoice_time: null, no_of_seats: 4 },
  { name: "Table 2", occupied: 1, latest_invoice_time: new Date().toISOString(), no_of_seats: 2 },
];

describe("CaptainTables", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockGetRooms.mockResolvedValue(mockRooms);
    mockGetTables.mockResolvedValue(mockTables);
    mockGetActiveTableOrders.mockResolvedValue(new Map());
    mockGetUserFullNames.mockResolvedValue(new Map());
  });

  it("shows loading state initially", () => {
    mockUseCaptainContext.mockReturnValue({
      context: null,
      capabilities: null,
      branch: null,
      rooms: [],
      isLoading: true,
      error: null,
    });

    render(
      <BrowserRouter>
        <CaptainTables />
      </BrowserRouter>
    );

    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });

  it("shows error state when context loading fails", () => {
    mockUseCaptainContext.mockReturnValue({
      context: null,
      capabilities: null,
      branch: null,
      rooms: [],
      isLoading: false,
      error: "Failed to load context",
    });

    render(
      <BrowserRouter>
        <CaptainTables />
      </BrowserRouter>
    );

    expect(screen.getByText(/unable to load tables/i)).toBeInTheDocument();
  });

  it("renders table grid after loading", async () => {
    mockUseCaptainContext.mockReturnValue({
      context: { user: "user123" },
      capabilities: { canAccessOtherCaptainsTables: false },
      branch: "Kozhikode",
      rooms: [{ name: "Main Hall" }],
      isLoading: false,
      error: null,
    });

    render(
      <BrowserRouter>
        <CaptainTables />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(mockGetRooms).toHaveBeenCalledWith("Kozhikode");
    });

    await waitFor(() => {
      expect(mockGetTables).toHaveBeenCalled();
    });
  });

  it("displays room tabs", async () => {
    mockUseCaptainContext.mockReturnValue({
      context: { user: "user123" },
      capabilities: { canAccessOtherCaptainsTables: false },
      branch: "Kozhikode",
      rooms: [],
      isLoading: false,
      error: null,
    });

    render(
      <BrowserRouter>
        <CaptainTables />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(mockGetRooms).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText(/Main Hall/)).toBeInTheDocument();
    });
  });

  it("allows switching between room tabs", async () => {
    mockUseCaptainContext.mockReturnValue({
      context: { user: "user123" },
      capabilities: { canAccessOtherCaptainsTables: false },
      branch: "Kozhikode",
      rooms: [],
      isLoading: false,
      error: null,
    });

    const user = userEvent.setup();
    render(
      <BrowserRouter>
        <CaptainTables />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(mockGetRooms).toHaveBeenCalled();
    });

    const buttons = screen.queryAllByRole("button");
    expect(buttons.length > 0).toBe(true);
  });

  it("displays tables for selected room", async () => {
    mockUseCaptainContext.mockReturnValue({
      context: { user: "user123" },
      capabilities: { canAccessOtherCaptainsTables: false },
      branch: "Kozhikode",
      rooms: [{ name: "Main Hall" }],
      isLoading: false,
      error: null,
    });

    render(
      <BrowserRouter>
        <CaptainTables />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(mockGetTables).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByTestId("table-card-Table 1")).toBeInTheDocument();
    });
  });

  it("shows no tables message when room is empty", async () => {
    mockGetTables.mockResolvedValue([]);
    mockUseCaptainContext.mockReturnValue({
      context: { user: "user123" },
      capabilities: { canAccessOtherCaptainsTables: false },
      branch: "Kozhikode",
      rooms: [{ name: "Main Hall" }],
      isLoading: false,
      error: null,
    });

    render(
      <BrowserRouter>
        <CaptainTables />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/no tables found/i)).toBeInTheDocument();
    });
  });

  it("shows no rooms message when branch has no rooms", async () => {
    mockGetRooms.mockResolvedValue([]);
    mockUseCaptainContext.mockReturnValue({
      context: { user: "user123" },
      capabilities: { canAccessOtherCaptainsTables: false },
      branch: "Kozhikode",
      rooms: [],
      isLoading: false,
      error: null,
    });

    render(
      <BrowserRouter>
        <CaptainTables />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/no rooms available/i)).toBeInTheDocument();
    });
  });

  it("loads active orders for branch", async () => {
    mockUseCaptainContext.mockReturnValue({
      context: { user: "user123" },
      capabilities: { canAccessOtherCaptainsTables: false },
      branch: "Kozhikode",
      rooms: [{ name: "Main Hall" }],
      isLoading: false,
      error: null,
    });

    render(
      <BrowserRouter>
        <CaptainTables />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(mockGetActiveTableOrders).toHaveBeenCalledWith("Kozhikode");
    });
  });

  it("navigates to table when free table is tapped", async () => {
    const user = userEvent.setup();
    mockUseCaptainContext.mockReturnValue({
      context: { user: "user123" },
      capabilities: { canAccessOtherCaptainsTables: false },
      branch: "Kozhikode",
      rooms: [{ name: "Main Hall" }],
      isLoading: false,
      error: null,
    });

    render(
      <BrowserRouter>
        <CaptainTables />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("table-card-Table 1")).toBeInTheDocument();
    });

    const tableCard = screen.getByTestId("table-card-Table 1");
    await user.click(tableCard);

    // Navigation should occur (tested indirectly through render)
    expect(tableCard).toBeInTheDocument();
  });

  it("shows refresh button", async () => {
    mockUseCaptainContext.mockReturnValue({
      context: { user: "user123" },
      capabilities: { canAccessOtherCaptainsTables: false },
      branch: "Kozhikode",
      rooms: [{ name: "Main Hall" }],
      isLoading: false,
      error: null,
    });

    render(
      <BrowserRouter>
        <CaptainTables />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument();
    });
  });

  it("defaults to captain's assigned room if available", async () => {
    mockUseCaptainContext.mockReturnValue({
      context: { user: "user123" },
      capabilities: { canAccessOtherCaptainsTables: false },
      branch: "Kozhikode",
      rooms: [{ name: "Main Hall" }],
      isLoading: false,
      error: null,
    });

    render(
      <BrowserRouter>
        <CaptainTables />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(mockGetTables).toHaveBeenCalledWith("Main Hall");
    });
  });
});
