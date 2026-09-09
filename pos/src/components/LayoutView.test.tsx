import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LayoutView from "./LayoutView";

const updateTableLayoutMock = vi.fn();
const getTableOrderMock = vi.fn();

vi.mock("../lib/table-api", () => ({
  updateTableLayout: (...args: any[]) => updateTableLayoutMock(...args),
}));

vi.mock("../lib/order-api", () => ({
  getTableOrder: (...args: any[]) => getTableOrderMock(...args),
}));

vi.mock("../lib/invoice-api", () => ({
  getCombinedOrderTotals: (order: any) => ({
    roundedTotal: 1000,
  }),
}));

vi.mock("@ury/core", () => ({
  formatInvoiceTime: (time: string) => "09:00 AM",
}));

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

vi.mock("./TableShapeIcon", () => ({
  TableShapeIcon: () => <div>Icon</div>,
}));

describe("LayoutView", () => {
  const mockTables = [
    {
      name: "Table-1",
      occupied: 0,
      table_shape: "Rectangle",
      no_of_seats: 4,
      layout_x: 100,
      layout_y: 100,
      latest_invoice_time: null,
    },
    {
      name: "Table-2",
      occupied: 1,
      table_shape: "Circle",
      no_of_seats: 2,
      layout_x: 300,
      layout_y: 100,
      latest_invoice_time: "2024-01-01 09:00:00",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    updateTableLayoutMock.mockResolvedValue(undefined);
    getTableOrderMock.mockResolvedValue({ message: {} });
  });

  it("renders the layout view header", () => {
    render(
      <LayoutView
        selectedRoom="Room-1"
        tables={mockTables}
        onBackToGrid={vi.fn()}
      />
    );

    expect(screen.getByText("tables.grid_view")).toBeInTheDocument();
    expect(screen.getByText(/Room-1/)).toBeInTheDocument();
  });

  it("renders tables on the canvas", () => {
    render(
      <LayoutView
        selectedRoom="Room-1"
        tables={mockTables}
        onBackToGrid={vi.fn()}
      />
    );

    expect(screen.getByText("Table-1")).toBeInTheDocument();
    expect(screen.getByText("Table-2")).toBeInTheDocument();
  });

  it("shows edit and layout buttons", () => {
    render(
      <LayoutView
        selectedRoom="Room-1"
        tables={mockTables}
        onBackToGrid={vi.fn()}
      />
    );

    expect(screen.getByText("tables.edit_layout")).toBeInTheDocument();
  });

  it("calls onBackToGrid when grid view button is clicked", async () => {
    const onBackToGrid = vi.fn();
    render(
      <LayoutView
        selectedRoom="Room-1"
        tables={mockTables}
        onBackToGrid={onBackToGrid}
      />
    );

    const gridButton = screen.getByText("tables.grid_view");
    await userEvent.click(gridButton);

    expect(onBackToGrid).toHaveBeenCalled();
  });

  it("shows zoom controls", () => {
    render(
      <LayoutView
        selectedRoom="Room-1"
        tables={mockTables}
        onBackToGrid={vi.fn()}
      />
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(3);
  });

  it("toggles edit mode when edit button is clicked", async () => {
    render(
      <LayoutView
        selectedRoom="Room-1"
        tables={mockTables}
        onBackToGrid={vi.fn()}
      />
    );

    const editButton = screen.getByText("tables.edit_layout");
    await userEvent.click(editButton);

    await waitFor(() => {
      expect(screen.getByText("tables.finish_editing")).toBeInTheDocument();
    });
  });

  it("selects a table when clicked", async () => {
    render(
      <LayoutView
        selectedRoom="Room-1"
        tables={mockTables}
        onBackToGrid={vi.fn()}
      />
    );

    const table1 = screen.getByText("Table-1");
    await userEvent.click(table1);

    await waitFor(() => {
      expect(screen.getByText("tables.table_info")).toBeInTheDocument();
    });
  });

  it("displays table properties panel when table is selected", async () => {
    render(
      <LayoutView
        selectedRoom="Room-1"
        tables={mockTables}
        onBackToGrid={vi.fn()}
      />
    );

    const table1 = screen.getByText("Table-1");
    await userEvent.click(table1);

    await waitFor(() => {
      expect(screen.getByText("tables.table_name")).toBeInTheDocument();
      expect(screen.getByText("tables.capacity")).toBeInTheDocument();
      expect(screen.getByText("tables.shape")).toBeInTheDocument();
    });
  });

  it("displays occupied badge for occupied tables", async () => {
    render(
      <LayoutView
        selectedRoom="Room-1"
        tables={mockTables}
        onBackToGrid={vi.fn()}
      />
    );

    const table2 = screen.getByText("Table-2");
    await userEvent.click(table2);

    await waitFor(() => {
      expect(screen.getByText("tables.status")).toBeInTheDocument();
    });
  });

  it("loads table order when clicking on occupied table", async () => {
    render(
      <LayoutView
        selectedRoom="Room-1"
        tables={mockTables}
        onBackToGrid={vi.fn()}
      />
    );

    const table2 = screen.getByText("Table-2");
    await userEvent.click(table2);

    await waitFor(() => {
      expect(getTableOrderMock).toHaveBeenCalledWith("Table-2");
    });
  });

  it("displays bill info for occupied tables", async () => {
    render(
      <LayoutView
        selectedRoom="Room-1"
        tables={mockTables}
        onBackToGrid={vi.fn()}
      />
    );

    const table2 = screen.getByText("Table-2");
    await userEvent.click(table2);

    await waitFor(() => {
      expect(screen.getByText("tables.current_bill")).toBeInTheDocument();
    });
  });

  it("hides table panel when X button is clicked", async () => {
    render(
      <LayoutView
        selectedRoom="Room-1"
        tables={mockTables}
        onBackToGrid={vi.fn()}
      />
    );

    const table1 = screen.getByText("Table-1");
    await userEvent.click(table1);

    await waitFor(() => {
      expect(screen.getByText("tables.table_info")).toBeInTheDocument();
    });

    const buttons = screen.getAllByRole("button");
    const closeButton = buttons[buttons.length - 1];
    await userEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText("tables.table_info")).not.toBeInTheDocument();
    });
  });
});
