import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AuthGuard from "./AuthGuard";

vi.mock("../store/root-store", () => {
  return {
    useRootStore: vi.fn(() => ({
      checkAuth: vi.fn(),
      user: { name: "user1" },
      isLoading: false,
      error: null,
      fetchPosProfile: vi.fn(),
      posProfile: { name: "POS-001" },
      allowedRoles: ["POS User"],
      hasAccess: true,
    })),
  };
});

vi.mock("@ury/ui", async () => {
  const actual = await vi.importActual<any>("@ury/ui");
  return {
    ...actual,
    Spinner: ({ message }: any) => <div>{message}</div>,
    Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  };
});

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

describe("AuthGuard", () => {
  it("renders children when user has access", () => {
    render(
      <AuthGuard>
        <div>Protected Content</div>
      </AuthGuard>
    );

    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("renders without error", () => {
    render(
      <AuthGuard>
        <div>Test</div>
      </AuthGuard>
    );
    expect(screen.getByText("Test")).toBeInTheDocument();
  });
});
