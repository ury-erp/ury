import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Room, Table } from "../lib/table-api";

vi.mock("../lib/table-api", () => {
  const mockRooms: Room[] = [
    { name: "Main Hall", restaurant: "Test" } as any,
    { name: "Patio", restaurant: "Test" } as any,
  ];

  const mockTables: Table[] = [
    {
      name: "Table-01",
      restaurant_room: "Main Hall",
      occupied: 0,
      no_of_seats: 4,
      table_shape: "Rectangle",
      is_take_away: 0,
      latest_invoice_time: null,
    } as any,
    {
      name: "Table-02",
      restaurant_room: "Main Hall",
      occupied: 1,
      no_of_seats: 6,
      table_shape: "Round",
      is_take_away: 0,
      latest_invoice_time: "2026-09-09 14:00:00",
    } as any,
  ];

  return {
    getRooms: vi.fn().mockResolvedValue(mockRooms),
    getTables: vi.fn().mockResolvedValue(mockTables),
  };
});

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => ({
    selectedTable: null,
    setSelectedTable: vi.fn(),
    posProfile: { branch: "Kozhikode", name: "POS-001" },
  }),
}));

vi.mock("./TableShapeIcon", () => ({
  TableShapeIcon: ({ shape }: { shape: string }) => <div>{shape}</div>,
}));

vi.mock("../lib/table-utils", () => ({
  getMergeGroupMembers: () => [],
  formatMergedTableLabelFromGroup: (members: string[]) => members.join(", "),
}));

import TableSelectionDialog from "./TableSelectionDialog";

const renderTableSelectionDialog = (onClose = vi.fn()) => {
  return render(<TableSelectionDialog onClose={onClose} />);
};

describe("TableSelectionDialog", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("renders dialog with title", () => {
    renderTableSelectionDialog();
    expect(screen.getByText("common.select_table_title")).toBeInTheDocument();
  });

  it("loads and renders rooms on mount", async () => {
    renderTableSelectionDialog();

    await waitFor(() => {
      expect(screen.getByText("Main Hall")).toBeInTheDocument();
      expect(screen.getByText("Patio")).toBeInTheDocument();
    });
  });

  it("loads and renders tables when room is selected", async () => {
    renderTableSelectionDialog();

    await waitFor(() => {
      expect(screen.getByText("Main Hall")).toBeInTheDocument();
    });

    expect(await screen.findByText("Table-01")).toBeInTheDocument();
    expect(screen.getByText("Table-02")).toBeInTheDocument();
  });

  it("shows occupied badge for occupied tables", async () => {
    renderTableSelectionDialog();

    await waitFor(() => {
      expect(screen.getByText("Table-02")).toBeInTheDocument();
    });

    const occupiedBadges = screen.queryAllByText("tables.occupied");
    expect(occupiedBadges.length).toBeGreaterThan(0);
  });

  it("calls onClose when table is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<TableSelectionDialog onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("Table-01")).toBeInTheDocument();
    });

    const tableButton = screen.getByRole("button", { name: /Table-01/i });
    await user.click(tableButton);

    expect(onClose).toHaveBeenCalled();
  });

  it("switches between rooms when room button is clicked", async () => {
    const user = userEvent.setup();
    renderTableSelectionDialog();

    await waitFor(() => {
      expect(screen.getByText("Main Hall")).toBeInTheDocument();
    });

    const patioButton = screen.getByRole("button", { name: "Patio" });
    await user.click(patioButton);

    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      const patiobtn = buttons.find((b) => b.textContent === "Patio");
      expect(patiobtn).toHaveAttribute("data-selected", "true");
    });
  });

  it("shows loading state while fetching data", async () => {
    vi.resetModules();
    renderTableSelectionDialog();

    expect(screen.getByText("common.loading_rooms")).toBeInTheDocument();

    await waitFor(
      () => {
        expect(screen.queryByText("common.loading_rooms")).not.toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it("renders close button", async () => {
    renderTableSelectionDialog();

    await waitFor(() => {
      expect(screen.getByText("Main Hall")).toBeInTheDocument();
    });

    const closeButtons = screen.queryAllByRole("button");
    expect(closeButtons.length).toBeGreaterThan(0);
  });
});
