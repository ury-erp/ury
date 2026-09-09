import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactNode, useRef, forwardRef } from "react";
import ChatWidget, { ChatWidgetRefProvider, AiEnabledProvider } from "./ChatWidget";
import { ActiveReportProvider } from "./ActiveReportContext";

// Mock lucide-react
vi.mock("lucide-react", () => ({
  MessageCircle: () => <span data-testid="message-circle">MessageCircle</span>,
  X: () => <span>X</span>,
  Send: () => <span>Send</span>,
  Sparkles: () => <span>Sparkles</span>,
  CheckCircle: () => <span>CheckCircle</span>,
  XCircle: () => <span>XCircle</span>,
  Info: () => <span>Info</span>,
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

// Mock @ury/ui
vi.mock("@ury/ui", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
  buttonVariants: () => "button-variant",
}));

// Mock @ury/core
const mockCall = {
  post: vi.fn(),
};

vi.mock("@ury/core", () => ({
  call: mockCall,
}));

// Mock reportNavigation
vi.mock("./reportNavigation", () => ({
  resolveReportNavigation: vi.fn(() => null),
  navigateToReportSlug: vi.fn(),
}));

describe("ChatWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCall.post.mockResolvedValue({
      message: {
        available: true,
        conversation_id: "conv-123",
      },
    });
  });

  const ChatWidgetTestWrapper = forwardRef((props: { aiEnabled: boolean }, ref: any) => {
    const chatRef = useRef(null);
    
    return (
      <ActiveReportProvider>
        <ChatWidgetRefProvider chatRef={chatRef}>
          <AiEnabledProvider enabled={props.aiEnabled}>
            <ChatWidget ref={chatRef} />
          </AiEnabledProvider>
        </ChatWidgetRefProvider>
      </ActiveReportProvider>
    );
  });

  it("renders floating button when AI is enabled", () => {
    render(<ChatWidgetTestWrapper aiEnabled={true} />);
    expect(screen.getByLabelText("Open assistant chat")).toBeInTheDocument();
  });

  it("renders floating button even when AI is disabled", () => {
    render(<ChatWidgetTestWrapper aiEnabled={false} />);
    expect(screen.getByLabelText("Open assistant chat")).toBeInTheDocument();
  });

  it("opens chat panel when button is clicked", async () => {
    const user = userEvent.setup();
    render(<ChatWidgetTestWrapper aiEnabled={true} />);

    const button = screen.getByLabelText("Open assistant chat");
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText("HUF")).toBeInTheDocument();
    });
  });

  it("closes chat panel when X button is clicked", async () => {
    const user = userEvent.setup();
    render(<ChatWidgetTestWrapper aiEnabled={true} />);

    const openButton = screen.getByLabelText("Open assistant chat");
    await user.click(openButton);

    await waitFor(() => {
      expect(screen.getByLabelText("Close chat")).toBeInTheDocument();
    });

    const closeButton = screen.getByLabelText("Close chat");
    await user.click(closeButton);

    expect(screen.queryByLabelText("Close chat")).not.toBeInTheDocument();
  });

  it("displays HUF branding in header", async () => {
    const user = userEvent.setup();
    render(<ChatWidgetTestWrapper aiEnabled={true} />);

    const button = screen.getByLabelText("Open assistant chat");
    await user.click(button);

    await waitFor(() => {
      expect(screen.getAllByText("HUF").length).toBeGreaterThan(0);
    });
  });

  it("displays floating button with message icon", () => {
    render(<ChatWidgetTestWrapper aiEnabled={true} />);
    expect(screen.getByTestId("message-circle")).toBeInTheDocument();
  });
});
