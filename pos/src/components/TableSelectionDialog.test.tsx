import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TableSelectionDialog from "./TableSelectionDialog";

const getRoomsMock = vi.fn();
const getTablesMock = vi.fn();
vi.mock("../lib/table-api", () => ({
  getRooms: (...args: any[]) => getRoomsMock(...args),
  getTables: (...args: any[]) => getTablesMock(...args),
}));

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => ({
    selectedTable: null,
    setSelectedTable: vi.fn(),
    posProfile: {
      name: "POS-1",
      branch: "Main Branch",
    },
  }),
}));

vi.mock("../lib/table-utils", () => ({
  getMergeGroupMembers: () => [],
  formatMergedTableLabelFromGroup: () => null,
}));

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

vi.mock("./TableShapeIcon", () => ({
  TableShapeIcon: () => <div>Table Icon</div>,
}));

describe("TableSelectionDialog", () => {
  const mockRooms = [
    { name: "Room-1", branch: "Main Branch" },
    { name: "Room-2", branch: "Main Branch" },
  ];

  const mockTables = [
    { name: "Table-1", occupied: 0, table_shape: "Rectangle", no_of_seats: 4, layout_x: 100, layout_y: 100 },
    { name: "Table-2", occupied: 1, table_shape: "Circle", no_of_seats: 2, layout_x: 200, layout_y: 100 },
    { name: "Table-3", occupied: 0, table_shape: "Square", no_of_seats: 6, layout_x: 300, layout_y: 100 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    getRoomsMock.mockResolvedValue(mockRooms);
    getTablesMock.mockResolvedValue(mockTables);
    localStorage.clear();
    sessionStorage.clear();
  });

  it("renders dialog title", async () => {
    render(<TableSelectionDialog onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("common.select_table_title")).toBeInTheDocument();
    });
  });

  it("loads and displays rooms on mount", async () => {
    render(<TableSelectionDialog onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Room-1")).toBeInTheDocument();
      expect(screen.getByText("Room-2")).toBeInTheDocument();
    });
  });

  it("loads tables when a room is selected", async () => {
    render(<TableSelectionDialog onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Room-1")).toBeInTheDocument();
    });

    expect(getTablesMock).toHaveBeenCalled();
  });

  it("displays tables in a grid", async () => {
    render(<TableSelectionDialog onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Table-1")).toBeInTheDocument();
      expect(screen.getByText("Table-2")).toBeInTheDocument();
      expect(screen.getByText("Table-3")).toBeInTheDocument();
    });
  });

  it("shows occupied badge for occupied tables", async () => {
    render(<TableSelectionDialog onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Table-2")).toBeInTheDocument();
    });

    const badges = screen.getAllByText("tables.occupied");
    expect(badges.length).toBeGreaterThan(0);
  });

  it("shows loading spinner while fetching rooms", async () => {
    getRoomsMock.mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(mockRooms), 100)));
    
    render(<TableSelectionDialog onClose={vi.fn()} />);

    expect(screen.getByText("common.loading_rooms")).toBeInTheDocument();
  });

  it("shows loading spinner while fetching tables", async () => {
    getTablesMock.mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(mockTables), 100)));
    
    render(<TableSelectionDialog onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Room-1")).toBeInTheDocument();
    });

    expect(screen.getByText("common.loading_tables")).toBeInTheDocument();
  });

  it("shows error message when room loading fails", async () => {
    getRoomsMock.mockRejectedValueOnce(new Error("Failed to load"));
    
    render(<TableSelectionDialog onClose={vi.fn()} />);

    await waitFor(() => {
      const errorMessages = screen.queryAllByText("errors.failed_load_rooms");
      if (errorMessages.length === 0) {
        expect(screen.getByText("Failed to load rooms")).toBeInTheDocument();
      } else {
        expect(errorMessages.length).toBeGreaterThan(0);
      }
    });
  });

  it("shows error message when table loading fails", async () => {
    getTablesMock.mockRejectedValueOnce(new Error("Failed to load"));
    
    render(<TableSelectionDialog onClose={vi.fn()} />);

    await waitFor(() => {
      const errorMessages = screen.queryAllByText("errors.failed_load_tables");
      if (errorMessages.length === 0) {
        expect(screen.getByText("Failed to load tables")).toBeInTheDocument();
      } else {
        expect(errorMessages.length).toBeGreaterThan(0);
      }
    });
  });

  it("caches rooms in session storage", async () => {
    render(<TableSelectionDialog onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Room-1")).toBeInTheDocument();
    });

    const cached = sessionStorage.getItem("ury_rooms_Main Branch");
    expect(cached).toBeTruthy();
  });

  it("uses cached rooms on subsequent renders", async () => {
    render(<TableSelectionDialog onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Room-1")).toBeInTheDocument();
    });

    const firstCallCount = getRoomsMock.mock.calls.length;

    render(<TableSelectionDialog onClose={vi.fn()} />);
    
    expect(getRoomsMock.mock.calls.length).toBe(firstCallCount);
  });

  it("calls onClose when close button is clicked", async () => {
    const onClose = vi.fn();
    render(<TableSelectionDialog onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("Room-1")).toBeInTheDocument();
    });

    const buttons = screen.getAllByRole("button");
    if (buttons.length > 0) {
      await userEvent.click(buttons[0]);
      expect(onClose).toHaveBeenCalled();
    }
  });

  it("caches tables per room", async () => {
    render(<TableSelectionDialog onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Room-1")).toBeInTheDocument();
    });

    const callCount = getTablesMock.mock.calls.length;

    const room1Button = screen.getByText("Room-1");
    await userEvent.click(room1Button);

    expect(getTablesMock.mock.calls.length).toBe(callCount);
  });
});
