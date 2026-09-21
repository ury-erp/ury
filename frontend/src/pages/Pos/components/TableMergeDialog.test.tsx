import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TableMergeDialog from "./TableMergeDialog";

vi.mock("../i18n", () => ({
  t: (key: string, params?: any) => {
    const translations: Record<string, any> = {
      "tables.merge_with": `Merge with ${params?.table || ""}`,
      "tables.select_tables_to_merge": "Select tables to merge",
      "tables.no_tables_to_merge": "No tables to merge",
      "tables.seats": "Seats",
      "tables.occupied": "Occupied",
      "tables.available": "Available",
      "common.cancel": "Cancel",
      "tables.merge_confirm": "Merge",
    };
    return translations[key] || key;
  },
}));

vi.mock("./TableShapeIcon", () => ({
  TableShapeIcon: ({ shape }: any) => <div>TableIcon-{shape}</div>,
}));

const mockTables = [
  { name: "T1", occupied: 0, table_shape: "Rectangle", no_of_seats: 4 },
  { name: "T2", occupied: 0, table_shape: "Round", no_of_seats: 2 },
];

describe("TableMergeDialog", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("returns null when sourceTable is null", () => {
    const { container } = render(
      <TableMergeDialog
        open={true}
        onOpenChange={vi.fn()}
        sourceTable={null}
        availableTables={mockTables}
        onConfirm={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders dialog when open and sourceTable exists", () => {
    render(
      <TableMergeDialog
        open={true}
        onOpenChange={vi.fn()}
        sourceTable={mockTables[0]}
        availableTables={mockTables}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText(/Merge with T1/)).toBeInTheDocument();
  });

  it("displays available tables for merging", () => {
    render(
      <TableMergeDialog
        open={true}
        onOpenChange={vi.fn()}
        sourceTable={mockTables[0]}
        availableTables={mockTables}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText("T2")).toBeInTheDocument();
  });

  it("disables merge button when no tables selected", () => {
    render(
      <TableMergeDialog
        open={true}
        onOpenChange={vi.fn()}
        sourceTable={mockTables[0]}
        availableTables={mockTables}
        onConfirm={vi.fn()}
      />
    );
    const mergeButton = screen.getByRole("button", { name: /Merge/ });
    expect(mergeButton).toBeDisabled();
  });

  it("calls onConfirm when merge button clicked with selection", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    
    render(
      <TableMergeDialog
        open={true}
        onOpenChange={vi.fn()}
        sourceTable={mockTables[0]}
        availableTables={mockTables}
        onConfirm={onConfirm}
      />
    );
    
    const t2Button = screen.getByText("T2").closest("button");
    if (t2Button) await user.click(t2Button);
    
    const mergeButton = screen.getByRole("button", { name: /Merge/ });
    await user.click(mergeButton);
    
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalled();
    });
  });

  it("shows merge button text", () => {
    render(
      <TableMergeDialog
        open={true}
        onOpenChange={vi.fn()}
        sourceTable={mockTables[0]}
        availableTables={mockTables}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText("Merge")).toBeInTheDocument();
  });

  it("shows cancel button", () => {
    render(
      <TableMergeDialog
        open={true}
        onOpenChange={vi.fn()}
        sourceTable={mockTables[0]}
        availableTables={mockTables}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });
});
