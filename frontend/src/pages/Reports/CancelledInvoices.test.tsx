import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CancelledInvoices } from "./CancelledInvoices";

vi.mock("../../context/BranchContext", () => ({
  useBranchContext: () => ({ activeBranchId: "Kozhikode" }),
}));

const mockCall = vi.fn();
vi.mock("@ury/core", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    call: (...args) => mockCall(...args),
    formatCurrency: (amount) => "Rs. " + amount,
  };
});

vi.mock("../../components/DeskLink", () => ({
  DeskLink: ({ name }) => <span>{name}-link</span>,
}));

describe("CancelledInvoices", () => {
  beforeEach(() => { cleanup(); mockCall.mockReset(); });

  it("renders header", async () => {
    mockCall.mockResolvedValue({
      message: {
        invoices: [],
        summary: { total_count: 0, total_amount: 0, unique_cancellers: 0, avg_amount: 0 },
        pagination: { page: 1, page_size: 50, total: 0, total_pages: 0 },
      },
    });
    render(<CancelledInvoices />);
    expect(screen.getByText("Cancelled Invoices")).toBeInTheDocument();
  });

  it("displays invoice KPI", async () => {
    mockCall.mockResolvedValue({
      message: {
        invoices: [],
        summary: { total_count: 5, total_amount: 2500, unique_cancellers: 2, avg_amount: 500 },
        pagination: { page: 1, page_size: 50, total: 5, total_pages: 1 },
      },
    });
    render(<CancelledInvoices />);
    await waitFor(() => {
      expect(screen.getByText("Total Cancelled")).toBeInTheDocument();
      expect(screen.getByText("5")).toBeInTheDocument();
    });
  });

  it("displays cancelled invoices table", async () => {
    mockCall.mockResolvedValue({
      message: {
        invoices: [
          { date: "2026-09-01", time: "10:30", invoice: "INV-001", amount: 500, cancelled_by: "john", cancellation_reason: "Customer request" },
        ],
        summary: { total_count: 1, total_amount: 500, unique_cancellers: 1, avg_amount: 500 },
        pagination: { page: 1, page_size: 50, total: 1, total_pages: 1 },
      },
    });
    render(<CancelledInvoices />);
    await waitFor(() => {
      expect(screen.getByText("INV-001-link")).toBeInTheDocument();
      expect(screen.getByText("john")).toBeInTheDocument();
    });
  });

  it("handles pagination", async () => {
    mockCall.mockResolvedValue({
      message: {
        invoices: [{ date: "2026-09-01", time: "10:30", invoice: "INV-001", amount: 500, cancelled_by: "john", cancellation_reason: null }],
        summary: { total_count: 1, total_amount: 500, unique_cancellers: 1, avg_amount: 500 },
        pagination: { page: 1, page_size: 50, total: 100, total_pages: 2 },
      },
    });
    render(<CancelledInvoices />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Next/ })).toBeInTheDocument();
    });
  });

  it("navigates to next page", async () => {
    mockCall.mockResolvedValue({
      message: {
        invoices: [],
        summary: { total_count: 0, total_amount: 0, unique_cancellers: 0, avg_amount: 0 },
        pagination: { page: 1, page_size: 50, total: 100, total_pages: 2 },
      },
    });
    render(<CancelledInvoices />);
    const nextBtn = await screen.findByRole("button", { name: /Next/ });
    await userEvent.click(nextBtn);
    await waitFor(() => {
      expect(mockCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ page: 2 }));
    });
  });
});
