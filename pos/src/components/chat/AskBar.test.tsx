import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactNode } from "react";
import AskBar from "./AskBar";
import { ChatWidgetRefProvider, AiEnabledProvider } from "./ChatWidget";

// Mock lucide-react with all icons needed
vi.mock("lucide-react", () => ({
  Sparkles: () => <span data-testid="sparkles-icon">Sparkles</span>,
  CheckCircle: () => <span>CheckCircle</span>,
  XCircle: () => <span>XCircle</span>,
  Info: () => <span>Info</span>,
  AlertTriangle: () => <span>AlertTriangle</span>,
  MessageCircle: () => <span>MessageCircle</span>,
  X: () => <span>X</span>,
  Send: () => <span>Send</span>,
  Bell: () => <span>Bell</span>,
  Users: () => <span>Users</span>,
  LogOut: () => <span>LogOut</span>,
  Activity: () => <span>Activity</span>,
  Gauge: () => <span>Gauge</span>,
  PackageSearch: () => <span>PackageSearch</span>,
  ArrowRight: () => <span>ArrowRight</span>,
  Star: () => <span>Star</span>,
  TrendingUp: () => <span>TrendingUp</span>,
}));

describe("AskBar", () => {
  const mockChatRef = {
    current: {
      openAndFocus: vi.fn(),
    },
  };

  const renderWithProviders = (aiEnabled: boolean = true) => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ChatWidgetRefProvider chatRef={mockChatRef}>
        <AiEnabledProvider enabled={aiEnabled}>
          {children}
        </AiEnabledProvider>
      </ChatWidgetRefProvider>
    );
    return render(<AskBar />, { wrapper });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockChatRef.current.openAndFocus.mockReset();
  });

  it("renders when AI is enabled", () => {
    renderWithProviders(true);

    expect(screen.getByRole("button")).toBeInTheDocument();
    expect(screen.getByText(/Ask about tonight/i)).toBeInTheDocument();
  });

  it("does not render when AI is disabled", () => {
    renderWithProviders(false);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("displays HUF badge", () => {
    renderWithProviders();

    expect(screen.getByText("HUF")).toBeInTheDocument();
  });

  it("displays keyboard shortcut hint", () => {
    renderWithProviders();

    expect(screen.getByText("⌘K")).toBeInTheDocument();
  });

  it("opens chat widget when button is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders();

    const button = screen.getByRole("button");
    await user.click(button);

    expect(mockChatRef.current.openAndFocus).toHaveBeenCalled();
  });

  it("opens chat widget on Cmd+K", async () => {
    renderWithProviders();

    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      bubbles: true,
    });

    window.dispatchEvent(event);

    await waitFor(() => {
      expect(mockChatRef.current.openAndFocus).toHaveBeenCalled();
    });
  });

  it("opens chat widget on Ctrl+K", async () => {
    renderWithProviders();

    const event = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
      bubbles: true,
    });

    window.dispatchEvent(event);

    await waitFor(() => {
      expect(mockChatRef.current.openAndFocus).toHaveBeenCalled();
    });
  });

  it("does not open chat on other key combinations", async () => {
    renderWithProviders();

    const event = new KeyboardEvent("keydown", {
      key: "j",
      metaKey: true,
      bubbles: true,
    });

    window.dispatchEvent(event);

    expect(mockChatRef.current.openAndFocus).not.toHaveBeenCalled();
  });

  it("prevents default behavior on Cmd+K", async () => {
    renderWithProviders();

    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });

    const preventDefaultSpy = vi.spyOn(event, "preventDefault");

    window.dispatchEvent(event);

    await waitFor(() => {
      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  it("renders with proper accessibility", () => {
    renderWithProviders();

    const button = screen.getByRole("button");
    expect(button).toHaveClass("flex");
    expect(button).toHaveClass("w-full");
  });

  it("displays sparkles icon", () => {
    renderWithProviders();

    expect(screen.getByTestId("sparkles-icon")).toBeInTheDocument();
  });
});
