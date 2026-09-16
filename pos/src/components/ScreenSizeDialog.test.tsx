import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ScreenSizeDialog from "./ScreenSizeDialog";

// Mock the lucide-react icons
vi.mock("lucide-react", () => ({
  Monitor: () => <div data-testid="monitor-icon">Monitor</div>,
  Smartphone: () => <div data-testid="smartphone-icon">Smartphone</div>,
  ExternalLink: () => <div data-testid="external-link-icon">Link</div>,
}));

// Mock the @ury/ui Button component
vi.mock("@ury/ui", () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

describe("ScreenSizeDialog", () => {
  let openSpy: any;

  beforeEach(() => {
    openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    vi.stubGlobal("innerWidth", 768);
  });

  it("renders the dialog", () => {
    const { container } = render(<ScreenSizeDialog />);
    expect(container.querySelector(".fixed")).toBeTruthy();
    expect(container.querySelector(".inset-0")).toBeTruthy();
  });

  it("displays Desktop Only heading", () => {
    render(<ScreenSizeDialog />);
    expect(screen.getByText("Desktop Only")).toBeInTheDocument();
  });

  it("displays warning message about screen size", () => {
    render(<ScreenSizeDialog />);
    expect(
      screen.getByText(/designed for desktop computers and tablets/i)
    ).toBeInTheDocument();
  });

  it("displays required screen size", () => {
    render(<ScreenSizeDialog />);
    // This text appears twice, so use queryAllByText and check at least one exists
    const matches = screen.queryAllByText("1024px or larger");
    expect(matches.length).toBeGreaterThan(0);
  });

  it("displays current screen width", () => {
    render(<ScreenSizeDialog />);
    expect(screen.getByText(/Current screen width:/i)).toBeInTheDocument();
  });

  it("renders Switch to Version 1 button", () => {
    render(<ScreenSizeDialog />);
    const button = screen.getByRole("button", { name: /Switch to Version 1/i });
    expect(button).toBeInTheDocument();
  });

  it("opens Version 1 in new tab on button click", async () => {
    const user = userEvent.setup();
    render(<ScreenSizeDialog />);
    const button = screen.getByRole("button", { name: /Switch to Version 1/i });
    
    await user.click(button);
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining("/urypos"),
      "_blank"
    );
  });

  it("renders with modal overlay", () => {
    const { container } = render(<ScreenSizeDialog />);
    const overlay = container.querySelector(".bg-black\\/50");
    expect(overlay).toBeInTheDocument();
  });

  it("displays modal card with white background", () => {
    const { container } = render(<ScreenSizeDialog />);
    const card = container.querySelector(".bg-white");
    expect(card).toBeInTheDocument();
    expect(card).toHaveClass("rounded-lg");
  });

  it("renders monitor and smartphone icons", () => {
    render(<ScreenSizeDialog />);
    expect(screen.getByTestId("monitor-icon")).toBeInTheDocument();
    expect(screen.getByTestId("smartphone-icon")).toBeInTheDocument();
  });
});
