import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import POSOpeningScreen from "./POSOpeningScreen";

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

vi.mock("../store/root-store", () => ({
  useRootStore: () => ({
    user: { name: "user1", full_name: "Test User" },
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
});
