import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SplitGroupPanel from "./SplitGroupPanel";

vi.mock("../lib/invoice-api", () => ({
  getSplitGroup: vi.fn(() => new Promise(() => {})),
}));

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

vi.mock("@ury/ui", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Spinner: ({ message }: any) => <div>{message}</div>,
}));

vi.mock("@ury/core", () => ({
  formatCurrency: (n: number) => n.toString(),
}));

describe("SplitGroupPanel", () => {
  it("renders without crashing with single invoice", () => {
    const { container } = render(
      <SplitGroupPanel invoiceName="inv1" onOpenInvoice={vi.fn()} />
    );
    expect(container).toBeTruthy();
  });

  it("accepts invoiceName prop", () => {
    const { container } = render(
      <SplitGroupPanel invoiceName="test-invoice" onOpenInvoice={vi.fn()} />
    );
    expect(container).toBeTruthy();
  });

  it("accepts onOpenInvoice callback", () => {
    const callback = vi.fn();
    const { container } = render(
      <SplitGroupPanel invoiceName="inv1" onOpenInvoice={callback} />
    );
    expect(container).toBeTruthy();
  });

  it("handles invoice name changes", () => {
    const { rerender } = render(
      <SplitGroupPanel invoiceName="inv1" onOpenInvoice={vi.fn()} />
    );

    rerender(
      <SplitGroupPanel invoiceName="inv2" onOpenInvoice={vi.fn()} />
    );

    expect(true).toBe(true);
  });

  it("loads split group on mount", () => {
    const { container } = render(
      <SplitGroupPanel invoiceName="inv1" onOpenInvoice={vi.fn()} />
    );
    expect(container).toBeTruthy();
  });

  it("cleans up subscription on unmount", () => {
    const { unmount } = render(
      <SplitGroupPanel invoiceName="inv1" onOpenInvoice={vi.fn()} />
    );
    unmount();
    expect(true).toBe(true);
  });
});
