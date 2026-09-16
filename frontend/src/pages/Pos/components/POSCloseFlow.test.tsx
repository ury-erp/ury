import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import POSCloseFlow from "./POSCloseFlow";

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

vi.mock("./POSClosingDialog", () => ({
  default: ({ onOpenChange, onClosingSubmitted }: any) => (
    <div data-testid="pos-closing-dialog">
      <button onClick={() => onClosingSubmitted?.()}>Submit Closing</button>
    </div>
  ),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

const renderPOSCloseFlow = () => {
  return render(
    <BrowserRouter>
      <POSCloseFlow />
    </BrowserRouter>
  );
};

describe("POSCloseFlow", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders close pos card with button", () => {
    renderPOSCloseFlow();
    expect(screen.getByText("settings.close_pos_title")).toBeInTheDocument();
    expect(screen.getByText("settings.close_pos_description")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /settings.close_pos_button/i })).toBeInTheDocument();
  });

  it("opens confirmation dialog when close button is clicked", async () => {
    const user = userEvent.setup();
    renderPOSCloseFlow();

    const closeButton = screen.getByRole("button", { name: /settings.close_pos_button/i });
    await user.click(closeButton);

    expect(screen.getByText("settings.confirm_title")).toBeInTheDocument();
    expect(screen.getByText("settings.confirm_description")).toBeInTheDocument();
  });

  it("closes confirmation dialog when cancel is clicked", async () => {
    const user = userEvent.setup();
    renderPOSCloseFlow();

    const closeButton = screen.getByRole("button", { name: /settings.close_pos_button/i });
    await user.click(closeButton);

    const cancelButton = screen.getByRole("button", { name: /settings.confirm_cancel/i });
    await user.click(cancelButton);

    expect(screen.queryByText("settings.confirm_title")).not.toBeInTheDocument();
  });

  it("opens POSClosingDialog when confirm is clicked", async () => {
    const user = userEvent.setup();
    renderPOSCloseFlow();

    const closeButton = screen.getByRole("button", { name: /settings.close_pos_button/i });
    await user.click(closeButton);

    const confirmButton = screen.getByRole("button", { name: /settings.confirm_button/i });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByTestId("pos-closing-dialog")).toBeInTheDocument();
    });
  });

  it("shows success message after closing is submitted", async () => {
    const user = userEvent.setup();
    renderPOSCloseFlow();

    const closeButton = screen.getByRole("button", { name: /settings.close_pos_button/i });
    await user.click(closeButton);

    const confirmButton = screen.getByRole("button", { name: /settings.confirm_button/i });
    await user.click(confirmButton);

    const submitButton = await screen.findByText("Submit Closing");
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("settings.closed_title")).toBeInTheDocument();
      expect(screen.getByText("settings.closed_description")).toBeInTheDocument();
    });
  });

  it("shows back to dashboard button after closing is submitted", async () => {
    const user = userEvent.setup();
    renderPOSCloseFlow();

    const closeButton = screen.getByRole("button", { name: /settings.close_pos_button/i });
    await user.click(closeButton);

    const confirmButton = screen.getByRole("button", { name: /settings.confirm_button/i });
    await user.click(confirmButton);

    const submitButton = await screen.findByText("Submit Closing");
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /settings.back_to_dashboard/i })).toBeInTheDocument();
    });
  });
});
