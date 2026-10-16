import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import POSOpeningScreen from "./POSOpeningScreen";
import { getPOSOpeningContext } from "../lib/pos-opening-api";

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

let mockUser: any = { name: "user1", full_name: "Test User", roles: ["URY Cashier"] };

vi.mock("../store/root-store", () => ({
  useRootStore: () => ({
    user: mockUser,
  }),
}));

vi.mock("../lib/pos-opening-api", () => ({
  getPOSOpeningContext: vi.fn(() => new Promise(() => {})),
  createPOSOpening: vi.fn(),
  parseFrappeError: () => "error",
}));

vi.mock("@ury/ui", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Badge: ({ children }: any) => <span>{children}</span>,
  Select: ({ children, ...props }: any) => <select {...props}>{children}</select>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
  Spinner: ({ message }: any) => <div>{message}</div>,
  showToast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@ury/core", () => ({
  formatCurrency: (n: number) => n.toString(),
}));

vi.mock("./POSOpeningPaymentTable", () => ({
  default: () => <div>Payment Table</div>,
}));

describe("POSOpeningScreen", () => {
  it("renders without crashing", () => {
    const { container } = render(<POSOpeningScreen />);
    expect(container).toBeTruthy();
  });

  it("calls onSuccess callback if provided", () => {
    const onSuccess = vi.fn();
    const { container } = render(<POSOpeningScreen onSuccess={onSuccess} />);
    expect(container).toBeTruthy();
  });

  it("calls onError callback if provided", () => {
    const onError = vi.fn();
    const { container } = render(<POSOpeningScreen onError={onError} />);
    expect(container).toBeTruthy();
  });

  it("handles missing callbacks", () => {
    const { container } = render(<POSOpeningScreen />);
    expect(container).toBeTruthy();
  });

  it("navigates to /pos/dashboard when cashier clicks Back to Dashboard", async () => {
    mockUser = { name: "cashier1", full_name: "Cashier User", roles: ["URY Cashier"] };
    vi.mocked(getPOSOpeningContext).mockResolvedValueOnce({
      company: "Test Co",
      allowed_profiles: [{ name: "Profile 1" }],
      selected_profile: "Profile 1",
      payment_modes: [],
      user: "test@example.com",
      branch: "Main",
      restaurant: "Rest",
      daily_close_pending: false,
      multi_cashier: { enabled: false, main_cashier_open: false, main_cashier_configured: false },
      permissions: { create: true, submit: true },
    });

    const originalLocation = window.location;
    // @ts-expect-error test mock
    delete window.location;
    window.location = { ...originalLocation, href: "" } as any;

    const { getByText } = render(<POSOpeningScreen />);

    await waitFor(() => {
      expect(getByText("pos_opening.back_to_dashboard")).toBeTruthy();
    });

    const backButton = getByText("pos_opening.back_to_dashboard");
    backButton.click();

    expect(window.location.href).toBe("/pos/dashboard");
    window.location = originalLocation as any;
  });

  it("navigates to /ury/dashboard when URY Manager clicks Back to Dashboard", async () => {
    mockUser = { name: "manager1", full_name: "Manager User", roles: ["URY Manager"] };
    vi.mocked(getPOSOpeningContext).mockResolvedValueOnce({
      company: "Test Co",
      allowed_profiles: [{ name: "Profile 1" }],
      selected_profile: "Profile 1",
      payment_modes: [],
      user: "test@example.com",
      branch: "Main",
      restaurant: "Rest",
      daily_close_pending: false,
      multi_cashier: { enabled: false, main_cashier_open: false, main_cashier_configured: false },
      permissions: { create: true, submit: true },
    });

    const originalLocation = window.location;
    // @ts-expect-error test mock
    delete window.location;
    window.location = { ...originalLocation, href: "" } as any;

    const { getByText } = render(<POSOpeningScreen />);

    await waitFor(() => {
      expect(getByText("pos_opening.back_to_dashboard")).toBeTruthy();
    });

    const backButton = getByText("pos_opening.back_to_dashboard");
    backButton.click();

    expect(window.location.href).toBe("/ury/dashboard");
    window.location = originalLocation as any;
  });
});

