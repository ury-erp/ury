import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TableUnmergeDialog from "./TableUnmergeDialog";

vi.mock("../i18n", () => ({
  t: (key: string, params?: any) => {
    if (params && params.tables) {
      return "tables.unmerge_group_description: " + params.tables;
    }
    return key;
  },
}));

describe("TableUnmergeDialog", () => {
  const mockSourceTable = {
    name: "Table-1",
    occupied: 0,
    table_shape: "Rectangle",
    no_of_seats: 4,
    layout_x: 100,
    layout_y: 100,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when sourceTable is null", () => {
    const { container } = render(
      <TableUnmergeDialog
        open={true}
        onOpenChange={vi.fn()}
        sourceTable={null}
        groupMembers={["Table-1", "Table-2"]}
        onConfirm={vi.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders dialog with title and description when sourceTable is provided", () => {
    render(
      <TableUnmergeDialog
        open={true}
        onOpenChange={vi.fn()}
        sourceTable={mockSourceTable}
        groupMembers={["Table-1", "Table-2"]}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByText("tables.unmerge_group_title")).toBeInTheDocument();
    expect(screen.getByText(/tables.unmerge_group_description/)).toBeInTheDocument();
  });

  it("displays group members in description", () => {
    render(
      <TableUnmergeDialog
        open={true}
        onOpenChange={vi.fn()}
        sourceTable={mockSourceTable}
        groupMembers={["Table-1", "Table-2", "Table-3"]}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByText(/Table-1, Table-2, Table-3/)).toBeInTheDocument();
  });

  it("renders cancel and confirm buttons", () => {
    render(
      <TableUnmergeDialog
        open={true}
        onOpenChange={vi.fn()}
        sourceTable={mockSourceTable}
        groupMembers={["Table-1", "Table-2"]}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByText("common.cancel")).toBeInTheDocument();
    expect(screen.getByText("tables.unmerge_confirm")).toBeInTheDocument();
  });

  it("calls onOpenChange with false when cancel button is clicked", async () => {
    const onOpenChange = vi.fn();
    render(
      <TableUnmergeDialog
        open={true}
        onOpenChange={onOpenChange}
        sourceTable={mockSourceTable}
        groupMembers={["Table-1", "Table-2"]}
        onConfirm={vi.fn()}
      />
    );

    const cancelButton = screen.getByText("common.cancel");
    await userEvent.click(cancelButton);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onConfirm and closes dialog when confirm button is clicked", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    
    render(
      <TableUnmergeDialog
        open={true}
        onOpenChange={onOpenChange}
        sourceTable={mockSourceTable}
        groupMembers={["Table-1", "Table-2"]}
        onConfirm={onConfirm}
      />
    );

    const confirmButton = screen.getByText("tables.unmerge_confirm");
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("disables buttons while submitting", async () => {
    const onConfirm = vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
    
    render(
      <TableUnmergeDialog
        open={true}
        onOpenChange={vi.fn()}
        sourceTable={mockSourceTable}
        groupMembers={["Table-1", "Table-2"]}
        onConfirm={onConfirm}
      />
    );

    const confirmButton = screen.getByText("tables.unmerge_confirm") as HTMLButtonElement;
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(confirmButton).toBeDisabled();
    });
  });

  it("shows loading text while submitting", async () => {
    const onConfirm = vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
    
    render(
      <TableUnmergeDialog
        open={true}
        onOpenChange={vi.fn()}
        sourceTable={mockSourceTable}
        groupMembers={["Table-1", "Table-2"]}
        onConfirm={onConfirm}
      />
    );

    const confirmButton = screen.getByText("tables.unmerge_confirm");
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText("common.loading")).toBeInTheDocument();
    });
  });

  it("prevents dialog from closing while submitting", async () => {
    const onConfirm = vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
    const onOpenChange = vi.fn();
    
    render(
      <TableUnmergeDialog
        open={true}
        onOpenChange={onOpenChange}
        sourceTable={mockSourceTable}
        groupMembers={["Table-1", "Table-2"]}
        onConfirm={onConfirm}
      />
    );

    const confirmButton = screen.getByText("tables.unmerge_confirm");
    await userEvent.click(confirmButton);

    await waitFor(() => {
      const cancelButton = screen.getByText("common.cancel");
      expect(cancelButton).toBeDisabled();
    });
  });
});
