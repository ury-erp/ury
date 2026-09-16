import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import POSCloseFlow from "./POSCloseFlow";
import { BrowserRouter } from "react-router-dom";

vi.mock("./POSClosingDialog", () => ({
  default: ({ open, onOpenChange, onClosingSubmitted }: any) => (
    open ? (
      <div data-testid="pos-closing-dialog">
        <button onClick={() => onClosingSubmitted?.()}>Complete</button>
      </div>
    ) : null
  ),
}));

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

describe("POSCloseFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the initial close POS card", () => {
    render(
      <BrowserRouter>
        <POSCloseFlow />
      </BrowserRouter>
    );

    expect(screen.getByText("settings.close_pos_title")).toBeInTheDocument();
    expect(screen.getByText("settings.close_pos_description")).toBeInTheDocument();
  });

  it("renders a danger button to close POS", () => {
    render(
      <BrowserRouter>
        <POSCloseFlow />
      </BrowserRouter>
    );

    const closeButton = screen.getByText("settings.close_pos_button");
    expect(closeButton).toBeInTheDocument();
  });

  it("opens confirmation dialog when close button is clicked", async () => {
    render(
      <BrowserRouter>
        <POSCloseFlow />
      </BrowserRouter>
    );

    const closeButton = screen.getByText("settings.close_pos_button");
    await userEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.getByText("settings.confirm_title")).toBeInTheDocument();
      expect(screen.getByText("settings.confirm_description")).toBeInTheDocument();
    });
  });

  it("closes confirmation dialog when cancel is clicked", async () => {
    render(
      <BrowserRouter>
        <POSCloseFlow />
      </BrowserRouter>
    );

    const closeButton = screen.getByText("settings.close_pos_button");
    await userEvent.click(closeButton);

    const cancelButton = await screen.findByText("settings.confirm_cancel");
    await userEvent.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByText("settings.confirm_title")).not.toBeInTheDocument();
    });
  });

  it("opens POSClosingDialog when confirm button is clicked", async () => {
    render(
      <BrowserRouter>
        <POSCloseFlow />
      </BrowserRouter>
    );

    const closeButton = screen.getByText("settings.close_pos_button");
    await userEvent.click(closeButton);

    const confirmButton = await screen.findByText("settings.confirm_button");
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByTestId("pos-closing-dialog")).toBeInTheDocument();
    });
  });

  it("shows success message after closing is submitted", async () => {
    render(
      <BrowserRouter>
        <POSCloseFlow />
      </BrowserRouter>
    );

    const closeButton = screen.getByText("settings.close_pos_button");
    await userEvent.click(closeButton);

    const confirmButton = await screen.findByText("settings.confirm_button");
    await userEvent.click(confirmButton);

    const completeButton = await screen.findByText("Complete");
    await userEvent.click(completeButton);

    await waitFor(() => {
      expect(screen.getByText("settings.closed_title")).toBeInTheDocument();
      expect(screen.getByText("settings.closed_description")).toBeInTheDocument();
    });
  });

  it("shows back to dashboard button after successful close", async () => {
    render(
      <BrowserRouter>
        <POSCloseFlow />
      </BrowserRouter>
    );

    const closeButton = screen.getByText("settings.close_pos_button");
    await userEvent.click(closeButton);

    const confirmButton = await screen.findByText("settings.confirm_button");
    await userEvent.click(confirmButton);

    const completeButton = await screen.findByText("Complete");
    await userEvent.click(completeButton);

    await waitFor(() => {
      expect(screen.getByText("settings.back_to_dashboard")).toBeInTheDocument();
    });
  });
});
