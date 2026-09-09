import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CaptainTransferDialog from "./CaptainTransferDialog";

vi.mock("@ury/core", () => {
  return {
    db: {
      getDocList: vi.fn().mockResolvedValue([]),
    },
  };
});

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

vi.mock("@ury/ui", async () => {
  const actual = await vi.importActual<any>("@ury/ui");
  return {
    ...actual,
    Dialog: ({ open, children }: any) =>
      open ? (
        <div data-testid="captain-dialog">
          {children}
        </div>
      ) : null,
    DialogContent: ({ children }: any) => <div>{children}</div>,
    DialogHeader: ({ children }: any) => <div>{children}</div>,
    DialogTitle: ({ children }: any) => <div>{children}</div>,
    DialogDescription: ({ children }: any) => <div>{children}</div>,
    DialogFooter: ({ children }: any) => <div>{children}</div>,
    Button: ({ children, onClick, disabled, ...props }: any) => (
      <button onClick={onClick} disabled={disabled} {...props}>
        {children}
      </button>
    ),
    Input: ({ value, onChange, readOnly, ...props }: any) => (
      <input value={value} onChange={onChange} readOnly={readOnly} {...props} />
    ),
    Spinner: ({ message }: any) => <div>{message}</div>,
    cn: (...args: any[]) => args.filter(Boolean).join(" "),
  };
});

describe("CaptainTransferDialog", () => {
  it("does not render when open is false", () => {
    const { queryByTestId } = render(
      <CaptainTransferDialog
        open={false}
        onOpenChange={vi.fn()}
        currentCaptain="user1"
        onConfirm={vi.fn()}
      />
    );
    expect(queryByTestId("captain-dialog")).not.toBeInTheDocument();
  });

  it("renders dialog when open is true", async () => {
    const { getByTestId } = render(
      <CaptainTransferDialog
        open={true}
        onOpenChange={vi.fn()}
        currentCaptain="user1"
        onConfirm={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(getByTestId("captain-dialog")).toBeInTheDocument();
    });
  });

  it("displays current captain value", () => {
    render(
      <CaptainTransferDialog
        open={true}
        onOpenChange={vi.fn()}
        currentCaptain="user1"
        onConfirm={vi.fn()}
      />
    );
    
    const inputs = screen.getAllByDisplayValue("user1");
    expect(inputs.length > 0).toBe(true);
  });
});
