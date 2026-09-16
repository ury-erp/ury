import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

// Mock window.location
const mockLocation = {
  origin: "http://localhost:5173",
  href: "http://localhost:5173/pos/",
  pathname: "/pos/",
  search: "",
  hash: "",
  reload: vi.fn(),
  replace: vi.fn(),
};
Object.defineProperty(window, "location", {
  value: mockLocation,
  writable: true,
});

// Mock all the context providers and components
vi.mock("./components/AppLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="app-layout">{children}</div>,
}));

vi.mock("./pages/Orders", () => ({
  default: () => <div data-testid="orders-page">Orders</div>,
}));

vi.mock("./pages/POS", () => ({
  default: () => <div data-testid="pos-page">POS</div>,
}));

vi.mock("./pages/Table", () => ({
  default: () => <div data-testid="table-page">Table</div>,
}));

vi.mock("./pages/Dashboard", () => ({
  default: () => <div data-testid="dashboard-page">Dashboard</div>,
}));

vi.mock("./pages/Settings", () => ({
  default: () => <div data-testid="settings-page">Settings</div>,
}));

vi.mock("./pages/OpenEntries", () => ({
  default: () => <div data-testid="open-entries-page">OpenEntries</div>,
}));

vi.mock("./components/AuthGuard", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="auth-guard">{children}</div>,
}));

vi.mock("./components/POSOpeningProvider", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="pos-opening-provider">{children}</div>,
}));

vi.mock("./components/ScreenSizeProvider", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="screen-size-provider">{children}</div>,
}));

vi.mock("./components/KotAlertListener", () => ({
  default: () => null,
}));

vi.mock("./captain/components/CaptainRouteGuard", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="captain-route-guard">{children}</div>,
}));

vi.mock("./captain/pages/CaptainTables", () => ({
  default: () => <div data-testid="captain-tables-page">CaptainTables</div>,
}));

vi.mock("./captain/pages/CaptainOrder", () => ({
  default: () => <div data-testid="captain-order-page">CaptainOrder</div>,
}));

vi.mock("@ury/ui", () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="toast-provider">{children}</div>,
}));

vi.mock("./components/chat/ChatWidget", () => ({
  default: () => <div data-testid="chat-widget">Chat</div>,
  ChatWidgetRefProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="chat-ref-provider">{children}</div>,
  AiEnabledProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="ai-enabled-provider">{children}</div>,
}));

vi.mock("./components/chat/ActiveReportContext", () => ({
  ActiveReportProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="active-report-provider">{children}</div>,
}));

vi.mock("./i18n", () => ({
  getActiveLanguage: () => "en",
}));

vi.mock("./store/pos-store", () => ({
  usePOSStore: () => ({
    initializeApp: vi.fn(),
  }),
}));

const mockCall = {
  get: vi.fn().mockResolvedValue({ message: { enabled: false } }),
};

vi.mock("@ury/core", () => ({
  call: mockCall,
}));

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCall.get.mockResolvedValue({ message: { enabled: false } });
  });

  it("renders toast provider", () => {
    render(<App />);
    expect(screen.getByTestId("toast-provider")).toBeInTheDocument();
  });

  it("renders auth guard", () => {
    render(<App />);
    expect(screen.getByTestId("auth-guard")).toBeInTheDocument();
  });

  it("renders app layout", () => {
    render(<App />);
    expect(screen.getByTestId("app-layout")).toBeInTheDocument();
  });
});
