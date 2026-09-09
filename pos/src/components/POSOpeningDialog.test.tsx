import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import POSOpeningDialog from "./POSOpeningDialog";

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

describe("POSOpeningDialog", () => {
  it("renders permission denied state", () => {
    render(
      <POSOpeningDialog
        state="permissionDenied"
        canAccessDesk={false}
        onRetry={vi.fn()}
        onContinue={vi.fn()}
      />
    );

    expect(screen.getByText("errors.posOpening.permission_denied")).toBeInTheDocument();
  });

  it("renders daily close pending state", () => {
    render(
      <POSOpeningDialog
        state="dailyClosePending"
        canAccessDesk={false}
        onRetry={vi.fn()}
        onContinue={vi.fn()}
      />
    );

    expect(screen.getByText("errors.posOpening.daily_close_pending")).toBeInTheDocument();
  });

  it("renders main cashier not open state", () => {
    render(
      <POSOpeningDialog
        state="mainCashierNotOpen"
        canAccessDesk={false}
        onRetry={vi.fn()}
        onContinue={vi.fn()}
      />
    );

    expect(screen.getByText("errors.posOpening.main_cashier_not_open")).toBeInTheDocument();
  });

  it("renders cross company open state", () => {
    render(
      <POSOpeningDialog
        state="crossCompanyOpen"
        existingEntry={null}
        canAccessDesk={false}
        onRetry={vi.fn()}
        onContinue={vi.fn()}
      />
    );

    expect(screen.getByText("pos.opening.session_elsewhere_title")).toBeInTheDocument();
  });

  it("renders generic error state", () => {
    render(
      <POSOpeningDialog
        state="genericError"
        canAccessDesk={false}
        onRetry={vi.fn()}
        onContinue={vi.fn()}
      />
    );

    expect(screen.getByText(/pos.opening.contact_manager/)).toBeInTheDocument();
  });

  it("calls onRetry when retry button clicked", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();

    render(
      <POSOpeningDialog
        state="mainCashierNotOpen"
        canAccessDesk={false}
        onRetry={onRetry}
        onContinue={vi.fn()}
      />
    );

    const retryButton = screen.getByText("pos.opening.retry");
    await user.click(retryButton);

    expect(onRetry).toHaveBeenCalled();
  });

  it("calls onContinue when continue button clicked", async () => {
    const onContinue = vi.fn();
    const user = userEvent.setup();

    render(
      <POSOpeningDialog
        state="crossCompanyOpen"
        existingEntry={null}
        canAccessDesk={false}
        onRetry={vi.fn()}
        onContinue={onContinue}
      />
    );

    const continueButton = screen.getByText("pos.opening.continue_to_pos");
    await user.click(continueButton);

    expect(onContinue).toHaveBeenCalled();
  });

  it("shows switch to desk button when canAccessDesk is true", () => {
    render(
      <POSOpeningDialog
        state="permissionDenied"
        canAccessDesk={true}
        onRetry={vi.fn()}
        onContinue={vi.fn()}
      />
    );

    expect(screen.getByText("pos.switch_to_desk")).toBeInTheDocument();
  });

  it("hides switch to desk button when canAccessDesk is false", () => {
    render(
      <POSOpeningDialog
        state="permissionDenied"
        canAccessDesk={false}
        onRetry={vi.fn()}
        onContinue={vi.fn()}
      />
    );

    expect(screen.queryByText("pos.switch_to_desk")).not.toBeInTheDocument();
  });
});
