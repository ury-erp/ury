import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CaptainActionsMenu from "./CaptainActionsMenu";

vi.mock("@ury/ui", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

describe("CaptainActionsMenu", () => {
  it("returns null when no actions are available", () => {
    const { container } = render(
      <CaptainActionsMenu isOpen={false} onOpenChange={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders menu button when action is available", () => {
    render(
      <CaptainActionsMenu
        isOpen={false}
        onOpenChange={vi.fn()}
        showReprintKot={true}
      />
    );
    expect(screen.getByLabelText("More actions")).toBeInTheDocument();
  });

  it("toggles menu open and closed", async () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <CaptainActionsMenu isOpen={false} onOpenChange={onOpenChange} showReprintKot={true} />
    );

    const button = screen.getByLabelText("More actions");
    await userEvent.click(button);
    expect(onOpenChange).toHaveBeenCalledWith(true);

    rerender(
      <CaptainActionsMenu isOpen={true} onOpenChange={onOpenChange} showReprintKot={true} />
    );
    await userEvent.click(button);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders reprint KOT action when enabled", () => {
    render(<CaptainActionsMenu isOpen={true} onOpenChange={vi.fn()} showReprintKot={true} />);
    expect(screen.getByText("Reprint KOT")).toBeInTheDocument();
  });

  it("renders transfer table action when enabled", () => {
    render(<CaptainActionsMenu isOpen={true} onOpenChange={vi.fn()} showTransferTable={true} />);
    expect(screen.getByText("Transfer table")).toBeInTheDocument();
  });

  it("renders transfer captain action when enabled", () => {
    render(<CaptainActionsMenu isOpen={true} onOpenChange={vi.fn()} showTransferCaptain={true} />);
    expect(screen.getByText("Transfer captain")).toBeInTheDocument();
  });

  it("renders print bill action when enabled", () => {
    render(<CaptainActionsMenu isOpen={true} onOpenChange={vi.fn()} showPrintBill={true} />);
    expect(screen.getByText("Print bill")).toBeInTheDocument();
  });

  it("calls onReprintKot handler when clicked", async () => {
    const onReprintKot = vi.fn();
    render(
      <CaptainActionsMenu
        isOpen={true}
        onOpenChange={vi.fn()}
        showReprintKot={true}
        onReprintKot={onReprintKot}
      />
    );
    await userEvent.click(screen.getByText("Reprint KOT"));
    expect(onReprintKot).toHaveBeenCalled();
  });

  it("disables button when loading", () => {
    render(
      <CaptainActionsMenu
        isOpen={true}
        onOpenChange={vi.fn()}
        showReprintKot={true}
        isReprintingKot={true}
      />
    );
    expect(screen.getByText("Reprint KOT")).toBeDisabled();
  });

  it("closes menu when action is clicked", async () => {
    const onOpenChange = vi.fn();
    render(
      <CaptainActionsMenu
        isOpen={true}
        onOpenChange={onOpenChange}
        showReprintKot={true}
        onReprintKot={vi.fn()}
      />
    );
    await userEvent.click(screen.getByText("Reprint KOT"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
