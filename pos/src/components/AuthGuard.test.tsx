import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import AuthGuard from "./AuthGuard";

const mockUseRootStore = vi.fn();

vi.mock("../store/root-store", () => ({
  useRootStore: () => mockUseRootStore(),
}));

vi.mock("@ury/ui", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Spinner: ({ message }: any) => <div data-testid="spinner">{message}</div>,
}));

vi.mock("lucide-react", () => ({
  RefreshCw: () => <div>RefreshIcon</div>,
}));

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

describe("AuthGuard", () => {
  beforeEach(() => {
    mockUseRootStore.mockReturnValue({
      checkAuth: vi.fn(),
      user: null,
      isLoading: false,
      error: null,
      fetchPosProfile: vi.fn(),
      posProfile: null,
      configLoading: false,
      configError: null,
      hasAccess: false,
      allowedRoles: ["POS User"],
    });
  });

  it("shows loading state while auth is loading", () => {
    mockUseRootStore.mockReturnValue({
      checkAuth: vi.fn(),
      user: null,
      isLoading: true,
      error: null,
      fetchPosProfile: vi.fn(),
      posProfile: null,
      configLoading: false,
      configError: null,
      hasAccess: false,
      allowedRoles: ["POS User"],
    });

    render(<AuthGuard><div>Content</div></AuthGuard>);
    
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });

  it("shows error message when auth error occurs", () => {
    mockUseRootStore.mockReturnValue({
      checkAuth: vi.fn(),
      user: null,
      isLoading: false,
      error: "Auth failed",
      fetchPosProfile: vi.fn(),
      posProfile: null,
      configLoading: false,
      configError: null,
      hasAccess: false,
      allowedRoles: ["POS User"],
    });

    render(<AuthGuard><div>Content</div></AuthGuard>);
    
    expect(screen.getByText("Access Denied")).toBeInTheDocument();
    expect(screen.getByText("Auth failed")).toBeInTheDocument();
  });

  it("shows POS profile configuration error", () => {
    mockUseRootStore.mockReturnValue({
      checkAuth: vi.fn(),
      user: { name: "user1" },
      isLoading: false,
      error: null,
      fetchPosProfile: vi.fn(),
      posProfile: null,
      configLoading: false,
      configError: null,
      hasAccess: true,
      allowedRoles: ["POS User"],
    });

    render(<AuthGuard><div>Content</div></AuthGuard>);
    
    expect(screen.getByText("Configuration Error")).toBeInTheDocument();
  });

  it("shows permission denied when user does not have access", () => {
    mockUseRootStore.mockReturnValue({
      checkAuth: vi.fn(),
      user: { name: "user1" },
      isLoading: false,
      error: null,
      fetchPosProfile: vi.fn(),
      posProfile: { name: "pos1" },
      configLoading: false,
      configError: null,
      hasAccess: false,
      allowedRoles: ["POS User"],
    });

    render(<AuthGuard><div>Content</div></AuthGuard>);
    
    expect(screen.getByText("Permission Required")).toBeInTheDocument();
    expect(screen.getByText(/POS User/)).toBeInTheDocument();
  });

  it("renders children when authenticated and authorized", () => {
    mockUseRootStore.mockReturnValue({
      checkAuth: vi.fn(),
      user: { name: "user1" },
      isLoading: false,
      error: null,
      fetchPosProfile: vi.fn(),
      posProfile: { name: "pos1" },
      configLoading: false,
      configError: null,
      hasAccess: true,
      allowedRoles: ["POS User"],
    });

    render(<AuthGuard><div>Protected Content</div></AuthGuard>);
    
    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("calls checkAuth on mount", () => {
    const checkAuth = vi.fn();
    mockUseRootStore.mockReturnValue({
      checkAuth,
      user: null,
      isLoading: false,
      error: null,
      fetchPosProfile: vi.fn(),
      posProfile: null,
      configLoading: false,
      configError: null,
      hasAccess: false,
      allowedRoles: ["POS User"],
    });

    render(<AuthGuard><div>Content</div></AuthGuard>);
    
    expect(checkAuth).toHaveBeenCalled();
  });

  it("calls fetchPosProfile when user becomes available", () => {
    const fetchPosProfile = vi.fn();
    mockUseRootStore.mockReturnValue({
      checkAuth: vi.fn(),
      user: { name: "user1" },
      isLoading: false,
      error: null,
      fetchPosProfile,
      posProfile: null,
      configLoading: false,
      configError: null,
      hasAccess: true,
      allowedRoles: ["POS User"],
    });

    render(<AuthGuard><div>Content</div></AuthGuard>);
    
    expect(fetchPosProfile).toHaveBeenCalled();
  });
});
