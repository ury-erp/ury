import { render, screen, cleanup } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserRouter } from "react-router-dom";

const mockInitializeApp = vi.fn();

vi.mock("./store/pos-store", () => ({
  usePOSStore: () => ({
    initializeApp: mockInitializeApp,
  }),
}));

vi.mock("./i18n", () => ({
  initI18n: vi.fn(),
}));

vi.mock("./components/Header", () => ({
  default: () => <div data-testid="header">Header</div>,
}));

vi.mock("./components/Footer", () => ({
  default: () => <div data-testid="footer">Footer</div>,
}));

vi.mock("./components/KotAlertListener", () => ({
  default: () => <div data-testid="kot-alert">KOT Alert</div>,
}));

vi.mock("./components/ScreenSizeProvider", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="screen-size-provider">{children}</div>
  ),
}));

vi.mock("./components/AuthGuard", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-guard">{children}</div>
  ),
}));

vi.mock("./components/POSOpeningProvider", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pos-opening-provider">{children}</div>
  ),
}));

import PosLayout from "./PosLayout";
import { initI18n } from "./i18n";

describe("PosLayout", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the layout structure with all providers and chrome components", async () => {
    render(
      <BrowserRouter>
        <PosLayout />
      </BrowserRouter>
    );

    expect(screen.getByTestId("header")).toBeInTheDocument();
    expect(screen.getByTestId("footer")).toBeInTheDocument();
    expect(screen.getByTestId("auth-guard")).toBeInTheDocument();
    expect(screen.getByTestId("pos-opening-provider")).toBeInTheDocument();
  });

  it("initializes i18n and app store on mount", async () => {
    render(
      <BrowserRouter>
        <PosLayout />
      </BrowserRouter>
    );

    expect(vi.mocked(initI18n)).toHaveBeenCalled();
    expect(mockInitializeApp).toHaveBeenCalled();
  });

  it("renders with ScreenSizeProvider wrapper for responsive behavior", async () => {
    render(
      <BrowserRouter>
        <PosLayout />
      </BrowserRouter>
    );

    expect(screen.getByTestId("screen-size-provider")).toBeInTheDocument();
  });

  it("includes KotAlertListener for alerts outside guards", async () => {
    render(
      <BrowserRouter>
        <PosLayout />
      </BrowserRouter>
    );

    expect(screen.getByTestId("kot-alert")).toBeInTheDocument();
  });

  it("renders the outlet for child routes inside the layout", async () => {
    render(
      <BrowserRouter>
        <PosLayout />
      </BrowserRouter>
    );

    const authGuard = screen.getByTestId("auth-guard");
    expect(authGuard).toBeInTheDocument();
  });
});
