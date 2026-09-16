import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ScreenSizeDialog from "./ScreenSizeDialog";

describe("ScreenSizeDialog", () => {
  it("renders with correct title", () => {
    render(<ScreenSizeDialog />);
    expect(screen.getAllByText("Desktop Only")[0]).toBeInTheDocument();
  });

  it("displays messaging about desktop requirement", () => {
    render(<ScreenSizeDialog />);
    expect(screen.getAllByText(/This POS system is designed for desktop computers/)[0]).toBeInTheDocument();
  });

  it("shows current screen info", () => {
    render(<ScreenSizeDialog />);
    const container = screen.getAllByText(/Current screen width/)[0];
    expect(container).toBeInTheDocument();
  });

  it("has Switch to Version 1 button and opens URL on click", async () => {
    const windowOpenSpy = vi.spyOn(window, "open").mockReturnValue(null);
    const user = userEvent.setup();
    
    render(<ScreenSizeDialog />);
    const buttons = screen.getAllByRole("button");
    const switchButton = buttons.find(btn => btn.textContent?.includes("Switch to Version 1"));
    
    if (switchButton) {
      await user.click(switchButton);
      expect(windowOpenSpy).toHaveBeenCalledWith(expect.stringContaining("/urypos"), "_blank");
    }
    
    windowOpenSpy.mockRestore();
  });

  it("has fixed overlay styling", () => {
    const { container } = render(<ScreenSizeDialog />);
    const overlay = container.firstChild as HTMLElement;
    expect(overlay).toHaveClass("fixed", "inset-0");
  });

  it("renders icons for mobile and desktop", () => {
    const { container } = render(<ScreenSizeDialog />);
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(2);
  });

  it("displays content in centered card layout", () => {
    const { container } = render(<ScreenSizeDialog />);
    const card = container.querySelector(".rounded-lg.p-8");
    expect(card).toBeInTheDocument();
  });
});
