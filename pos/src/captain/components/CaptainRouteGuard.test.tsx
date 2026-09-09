import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import CaptainRouteGuard from "./CaptainRouteGuard";

// Use vi.hoisted to define mocks outside the mock factory
const { mockUseCaptainContext } = vi.hoisted(() => ({
  mockUseCaptainContext: vi.fn(),
}));

vi.mock("../hooks/useCaptainContext", () => ({
  useCaptainContext: mockUseCaptainContext,
}));

vi.mock("./ServiceRequestPanel", () => ({
  default: ({ branch }: any) => <div data-testid="service-request-panel">ServiceRequestPanel: {branch}</div>,
}));

vi.mock("@ury/ui", () => ({
  Spinner: ({ message }: any) => <div data-testid="spinner">{message}</div>,
}));

describe("CaptainRouteGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders children when context is available", () => {
    mockUseCaptainContext.mockReturnValue({ 
      capabilities: { canTakeTableOrders: true },
      branch: "B1",
      isLoading: false,
      error: null
    });
    render(
      <CaptainRouteGuard>
        <div data-testid="protected-content">Protected Content</div>
      </CaptainRouteGuard>
    );
    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
  });
});
