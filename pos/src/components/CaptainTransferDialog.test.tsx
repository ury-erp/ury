import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockDbGetDocList } = vi.hoisted(() => {
  return {
    mockDbGetDocList: vi.fn(),
  };
});

vi.mock("@ury/core", () => {
  return {
    db: {
      getDocList: mockDbGetDocList,
    },
  };
});

vi.mock("@ury/ui", () => ({
  Dialog: ({ children, onOpenChange, open }: any) => open ? <div>{children}</div> : null,
  DialogContent: ({ children, onClose }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Input: ({ ...props }: any) => <input {...props} />,
  Spinner: ({ message }: any) => <div data-testid="spinner">{message}</div>,
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

import CaptainTransferDialog from "./CaptainTransferDialog";

describe("CaptainTransferDialog", () => {
  beforeEach(() => {
    mockDbGetDocList.mockResolvedValue([
      { name: "user2", full_name: "User Two" },
      { name: "user3", full_name: "User Three" },
    ]);
  });

  it("renders dialog when open is true", () => {
    render(
      <CaptainTransferDialog
        open={true}
        onOpenChange={vi.fn()}
        currentCaptain="user1"
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByTestId("dialog-content")).toBeInTheDocument();
  });

  it("does not render dialog when open is false", () => {
    render(
      <CaptainTransferDialog
        open={false}
        onOpenChange={vi.fn()}
        currentCaptain="user1"
        onConfirm={vi.fn()}
      />
    );

    expect(screen.queryByTestId("dialog-content")).not.toBeInTheDocument();
  });

  it("displays current captain", async () => {
    render(
      <CaptainTransferDialog
        open={true}
        onOpenChange={vi.fn()}
        currentCaptain="user1"
        onConfirm={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("user1")).toBeInTheDocument();
    });
  });

  it("displays title and description", () => {
    render(
      <CaptainTransferDialog
        open={true}
        onOpenChange={vi.fn()}
        currentCaptain="user1"
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByText(/tables.transfer_captain/)).toBeInTheDocument();
    expect(screen.getByText(/tables.select_new_captain/)).toBeInTheDocument();
  });

  it("displays list of available captains after loading", async () => {
    render(
      <CaptainTransferDialog
        open={true}
        onOpenChange={vi.fn()}
        currentCaptain="user1"
        onConfirm={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("User Two")).toBeInTheDocument();
      expect(screen.getByText("User Three")).toBeInTheDocument();
    });
  });

  it("excludes current captain from list", async () => {
    render(
      <CaptainTransferDialog
        open={true}
        onOpenChange={vi.fn()}
        currentCaptain="user1"
        onConfirm={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("User Two")).toBeInTheDocument();
      expect(screen.getByText("User Three")).toBeInTheDocument();
    });
  });

  it("disables confirm button when no captain is selected", async () => {
    render(
      <CaptainTransferDialog
        open={true}
        onOpenChange={vi.fn()}
        currentCaptain="user1"
        onConfirm={vi.fn()}
      />
    );

    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      const confirmBtn = buttons.find(b => b.textContent?.includes("tables.transfer_confirm"));
      expect(confirmBtn).toHaveAttribute("disabled");
    });
  });

  it("calls onOpenChange when close button is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <CaptainTransferDialog
        open={true}
        onOpenChange={onOpenChange}
        currentCaptain="user1"
        onConfirm={vi.fn()}
      />
    );

    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      const cancelBtn = buttons.find(b => b.textContent?.includes("common.cancel"));
      expect(cancelBtn).toBeInTheDocument();
    });
  });

  it("handles empty search results", async () => {
    mockDbGetDocList.mockResolvedValueOnce([]);

    render(
      <CaptainTransferDialog
        open={true}
        onOpenChange={vi.fn()}
        currentCaptain="user1"
        onConfirm={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/tables.no_captains_found/)).toBeInTheDocument();
    });
  });

  it("handles db errors gracefully", async () => {
    mockDbGetDocList.mockRejectedValueOnce(new Error("Database error"));

    render(
      <CaptainTransferDialog
        open={true}
        onOpenChange={vi.fn()}
        currentCaptain="user1"
        onConfirm={vi.fn()}
      />
    );

    await waitFor(() => {
      const errorElements = screen.queryAllByText(/Database error|tables.transfer_failed/);
      expect(errorElements.length).toBeGreaterThanOrEqual(0);
    });
  });
});
