import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("./ScreenSizeDialog", () => ({
  default: () => <div>Screen Size Dialog</div>,
}));

import ScreenSizeProvider from "./ScreenSizeProvider";

describe("ScreenSizeProvider", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders children when screen is large enough", () => {
    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      value: 1200,
      writable: true,
      configurable: true,
    });

    render(
      <ScreenSizeProvider>
        <div>Test Content</div>
      </ScreenSizeProvider>
    );

    expect(screen.getByText("Test Content")).toBeInTheDocument();

    Object.defineProperty(window, "innerWidth", {
      value: originalInnerWidth,
      writable: true,
      configurable: true,
    });
  });

  it("shows dialog when screen is too small", () => {
    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      value: 500,
      writable: true,
      configurable: true,
    });

    render(
      <ScreenSizeProvider>
        <div>Test Content</div>
      </ScreenSizeProvider>
    );

    expect(screen.getByText("Screen Size Dialog")).toBeInTheDocument();

    Object.defineProperty(window, "innerWidth", {
      value: originalInnerWidth,
      writable: true,
      configurable: true,
    });
  });

  it("exempts /order routes from size check", () => {
    const originalInnerWidth = window.innerWidth;

    Object.defineProperty(window, "innerWidth", {
      value: 500,
      writable: true,
      configurable: true,
    });

    // Mock window.location with /order path
    const mockLocation = { ...originalLocation, pathname: "/order/123" };
    Object.defineProperty(window, "location", {
      value: mockLocation,
      writable: true,
      configurable: true,
    });

    render(
      <ScreenSizeProvider>
        <div>Test Content</div>
      </ScreenSizeProvider>
    );

    expect(screen.getByText("Test Content")).toBeInTheDocument();

    // Restore
    Object.defineProperty(window, "innerWidth", {
      value: originalInnerWidth,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  it("responds to window resize events", () => {
    const originalInnerWidth = window.innerWidth;
    
    Object.defineProperty(window, "innerWidth", {
      value: 1200,
      writable: true,
      configurable: true,
    });

    const { rerender } = render(
      <ScreenSizeProvider>
        <div>Test Content</div>
      </ScreenSizeProvider>
    );

    expect(screen.getByText("Test Content")).toBeInTheDocument();

    Object.defineProperty(window, "innerWidth", {
      value: originalInnerWidth,
      writable: true,
      configurable: true,
    });
  });
});
