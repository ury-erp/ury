import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CaptainActionsMenu from "./CaptainActionsMenu";

vi.mock("@ury/ui", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

describe("CaptainActionsMenu", () => {
  beforeEach(() => {
    cleanup();
  });

  it("returns null when no actions are enabled", () => {
    const { container } = render(
      <CaptainActionsMenu
        isOpen={false}
        onOpenChange={vi.fn()}
        showReprintKot={false}
        showTransferTable={false}
        showTransferCaptain={false}
        showPrintBill={false}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders menu trigger button when at least one action is enabled", () => {
    render(
      <CaptainActionsMenu
        isOpen={false}
        onOpenChange={vi.fn()}
        showReprintKot={true}
        showTransferTable={false}
        showTransferCaptain={false}
        showPrintBill={false}
      />
    );
    expect(screen.getByRole("button", { name: /more actions/i })).toBeInTheDocument();
  });

  it("opens and closes menu on button click", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(
      <CaptainActionsMenu
        isOpen={false}
        onOpenChange={onOpenChange}
        showReprintKot={true}
      />
    );

    const button = screen.getByRole("button", { name: /more actions/i });
    await user.click(button);

    expect(onOpenChange).toHaveBeenCalledWith(true);

    rerender(
      <CaptainActionsMenu
        isOpen={true}
        onOpenChange={onOpenChange}
        showReprintKot={true}
      />
    );

    expect(screen.getByText("Reprint KOT")).toBeInTheDocument();
  });

  it("displays Reprint KOT option when showReprintKot is true", () => {
    render(
      <CaptainActionsMenu
        isOpen={true}
        onOpenChange={vi.fn()}
        showReprintKot={true}
        onReprintKot={vi.fn()}
      />
    );
    expect(screen.getByText("Reprint KOT")).toBeInTheDocument();
  });

  it("displays Transfer Table option when showTransferTable is true", () => {
    render(
      <CaptainActionsMenu
        isOpen={true}
        onOpenChange={vi.fn()}
        showTransferTable={true}
        onTransferTable={vi.fn()}
      />
    );
    expect(screen.getByText("Transfer table")).toBeInTheDocument();
  });

  it("displays Transfer Captain option when showTransferCaptain is true", () => {
    render(
      <CaptainActionsMenu
        isOpen={true}
        onOpenChange={vi.fn()}
        showTransferCaptain={true}
        onTransferCaptain={vi.fn()}
      />
    );
    expect(screen.getByText("Transfer captain")).toBeInTheDocument();
  });

  it("displays Print Bill option when showPrintBill is true", () => {
    render(
      <CaptainActionsMenu
        isOpen={true}
        onOpenChange={vi.fn()}
        showPrintBill={true}
        onPrintBill={vi.fn()}
      />
    );
    expect(screen.getByText("Print bill")).toBeInTheDocument();
  });

  it("calls onReprintKot when Reprint KOT is clicked", async () => {
    const onReprintKot = vi.fn();
    const user = userEvent.setup();

    render(
      <CaptainActionsMenu
        isOpen={true}
        onOpenChange={vi.fn()}
        showReprintKot={true}
        onReprintKot={onReprintKot}
      />
    );

    await user.click(screen.getByText("Reprint KOT"));
    expect(onReprintKot).toHaveBeenCalled();
  });

  it("calls onTransferTable when Transfer Table is clicked", async () => {
    const onTransferTable = vi.fn();
    const user = userEvent.setup();

    render(
      <CaptainActionsMenu
        isOpen={true}
        onOpenChange={vi.fn()}
        showTransferTable={true}
        onTransferTable={onTransferTable}
      />
    );

    await user.click(screen.getByText("Transfer table"));
    expect(onTransferTable).toHaveBeenCalled();
  });

  it("disables Reprint KOT button when isReprintingKot is true", () => {
    render(
      <CaptainActionsMenu
        isOpen={true}
        onOpenChange={vi.fn()}
        showReprintKot={true}
        onReprintKot={vi.fn()}
        isReprintingKot={true}
      />
    );

    const reprintButton = screen.getByText("Reprint KOT").closest("button");
    expect(reprintButton).toBeDisabled();
  });

  it("disables Print Bill button when isPrintingBill is true", () => {
    render(
      <CaptainActionsMenu
        isOpen={true}
        onOpenChange={vi.fn()}
        showPrintBill={true}
        onPrintBill={vi.fn()}
        isPrintingBill={true}
      />
    );

    const printButton = screen.getByText("Print bill").closest("button");
    expect(printButton).toBeDisabled();
  });

  it("closes menu when an action is clicked", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <CaptainActionsMenu
        isOpen={true}
        onOpenChange={onOpenChange}
        showReprintKot={true}
        onReprintKot={vi.fn()}
      />
    );

    await user.click(screen.getByText("Reprint KOT"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
