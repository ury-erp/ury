import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { DaywiseInvoices } from "./DaywiseInvoices";

vi.mock("../../context/BranchContext", () => ({
  useBranchContext: () => ({ activeBranchId: "Kozhikode" }),
}));

vi.mock("@ury/core", () => ({
  call: vi.fn(),
  formatCurrency: (val) => val.toString(),
}));

vi.mock("../../components/DeskLink", () => ({
  DeskLink: () => <span>link</span>,
}));

import { call } from "@ury/core";

describe("DaywiseInvoices", () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(call).mockClear();
  });

  it("renders page title", () => {
    vi.mocked(call).mockResolvedValue({
      message: { invoices: [], pagination: { total: 0 } }
    });
    render(<DaywiseInvoices />);
    expect(screen.getByText("Daywise Invoices")).toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    vi.mocked(call).mockReturnValue(new Promise(() => {}));
    render(<DaywiseInvoices />);
    expect(screen.getByText(/Loading|loading/)).toBeInTheDocument();
  });

  it("displays invoice data when loaded", async () => {
    vi.mocked(call).mockResolvedValue({
      message: {
        invoices: [{
          date: "2026-09-01", time: "10:30", invoice: "INV-001",
          item_total: 1000, total_taxes: 180, grand_total: 1180,
          received_amount: 1200, change_amount: 20, cash_discounts: 0, payment_mode: "Cash"
        }],
        pagination: { page: 1, page_size: 50, total: 1 }
      }
    });
    render(<DaywiseInvoices />);
    await waitFor(() => {
      expect(screen.getByText("INV-001")).toBeInTheDocument();
    });
  });

  it("handles API errors gracefully", async () => {
    const errorMsg = "Network failed";
    vi.mocked(call).mockRejectedValueOnce(new Error(errorMsg));
    render(<DaywiseInvoices />);
    await waitFor(() => {
      expect(screen.getByText(errorMsg)).toBeInTheDocument();
    });
  });

  it("renders without crashing when data is empty", async () => {
    vi.mocked(call).mockResolvedValue({
      message: { invoices: [], pagination: { total: 0, page_size: 50 } }
    });
    render(<DaywiseInvoices />);
    await waitFor(() => {
      expect(screen.getByText("Daywise Invoices")).toBeInTheDocument();
    });
  });
});
