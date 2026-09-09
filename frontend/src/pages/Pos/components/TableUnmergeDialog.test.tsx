import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TableUnmergeDialog from "./TableUnmergeDialog";
import type { Table } from "../lib/table-api";

vi.mock("../i18n", () => ({
  t: (key: string, params?: any) => {
    if (key === "tables.unmerge_group_description" && params) {
      return `Unmerge tables: ${params.tables}`;
    }
    return key;
  },
}));

const mockTable: Table = {
  name: "Table-01",
  restaurant_room: "Main Hall",
  occupied: 0,
  no_of_seats: 4,
  table_shape: "Rectangle",
  is_take_away: 0,
  latest_invoice_time: null,
} as any;

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  sourceTable: mockTable,
  groupMembers: ["Table-01", "Table-02"],
  onConfirm: vi.fn().mockResolvedValue(undefined),
};

describe("TableUnmergeDialog", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders nothing when sourceTable is null", () => {
    const { container } = render(
      <TableUnmergeDialog
        {...defaultProps}
        sourceTable={null}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders dialog title and description", () => {
    render(<TableUnmergeDialog {...defaultProps} />);
    expect(screen.getByText("tables.unmerge_group_title")).toBeInTheDocument();
    expect(screen.getByText(/Unmerge tables:/i)).toBeInTheDocument();
  });

  it("renders cancel and unmerge buttons", () => {
    render(<TableUnmergeDialog {...defaultProps} />);
    expect(screen.getByRole("button", { name: /common.cancel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tables.unmerge_confirm/i })).toBeInTheDocument();
  });

  it("closes dialog when cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(<TableUnmergeDialog {...defaultProps} onOpenChange={onOpenChange} />);

    const cancelButton = screen.getByRole("button", { name: /common.cancel/i });
    await user.click(cancelButton);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onConfirm when unmerge button is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(<TableUnmergeDialog {...defaultProps} onConfirm={onConfirm} />);

    const unmergeButton = screen.getByRole("button", { name: /tables.unmerge_confirm/i });
    await user.click(unmergeButton);

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalled();
    });
  });

  it("closes dialog after successful unmerge", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <TableUnmergeDialog
        {...defaultProps}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />
    );

    const unmergeButton = screen.getByRole("button", { name: /tables.unmerge_confirm/i });
    await user.click(unmergeButton);

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("shows loading state while confirming", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );

    render(<TableUnmergeDialog {...defaultProps} onConfirm={onConfirm} />);

    const unmergeButton = screen.getByRole("button", { name: /tables.unmerge_confirm/i });
    await user.click(unmergeButton);

    expect(screen.getByRole("button", { name: /common.loading/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /tables.unmerge_confirm/i })).toBeInTheDocument();
    });
  });

  it("disables buttons while submitting", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );

    render(<TableUnmergeDialog {...defaultProps} onConfirm={onConfirm} />);

    const unmergeButton = screen.getByRole("button", { name: /tables.unmerge_confirm/i });
    await user.click(unmergeButton);

    const cancelButton = screen.getByRole("button", { name: /common.cancel/i });
    expect(cancelButton).toBeDisabled();
    expect(unmergeButton).toBeDisabled();
  });

  it("includes group members in description", () => {
    render(
      <TableUnmergeDialog
        {...defaultProps}
        groupMembers={["Table-01", "Table-02", "Table-03"]}
      />
    );
    expect(screen.getByText(/Table-01, Table-02, Table-03/i)).toBeInTheDocument();
  });
});
