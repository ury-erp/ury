import { render, screen, cleanup } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CaptainRouteGuard from "./CaptainRouteGuard";

const mockUseCaptainContext = vi.fn();

vi.mock("../hooks/useCaptainContext", () => ({
  useCaptainContext: () => mockUseCaptainContext(),
}));

vi.mock("./ServiceRequestPanel", () => ({
  default: () => <div data-testid="service-request-panel">Service Requests</div>,
}));

vi.mock("@ury/ui", () => ({
  Spinner: ({ message }: { message: string }) => (
    <div data-testid="spinner">{message}</div>
  ),
}));

describe("CaptainRouteGuard", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders loading state while context is loading", () => {
    mockUseCaptainContext.mockReturnValue({
      capabilities: null,
      branch: null,
      isLoading: true,
      error: null,
    });

    render(
      <CaptainRouteGuard>
        <div>Content</div>
      </CaptainRouteGuard>
    );

    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });

  it("renders error state when context loading fails", () => {
    mockUseCaptainContext.mockReturnValue({
      capabilities: null,
      branch: null,
      isLoading: false,
      error: "Failed to load captain context",
    });

    render(
      <CaptainRouteGuard>
        <div>Content</div>
      </CaptainRouteGuard>
    );

    expect(screen.getByText(/unable to load captain context/i)).toBeInTheDocument();
  });

  it("renders permission denied when user cannot take table orders", () => {
    mockUseCaptainContext.mockReturnValue({
      capabilities: {
        canTakeTableOrders: false,
      },
      branch: "Kozhikode",
      isLoading: false,
      error: null,
    });

    render(
      <CaptainRouteGuard>
        <div>Content</div>
      </CaptainRouteGuard>
    );

    expect(screen.getByText(/not permitted/i)).toBeInTheDocument();
  });

  it("renders children and service panel when authorized", () => {
    mockUseCaptainContext.mockReturnValue({
      capabilities: {
        canTakeTableOrders: true,
      },
      branch: "Kozhikode",
      isLoading: false,
      error: null,
    });

    render(
      <CaptainRouteGuard>
        <div>Protected Content</div>
      </CaptainRouteGuard>
    );

    expect(screen.getByText(/protected content/i)).toBeInTheDocument();
    expect(screen.getByTestId("service-request-panel")).toBeInTheDocument();
  });
});
