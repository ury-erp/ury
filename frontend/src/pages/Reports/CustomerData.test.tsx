import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomerData } from "./CustomerData";

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

describe("CustomerData", () => {
  beforeEach(() => { cleanup(); mockCall.mockReset(); });

  it("renders header", () => {
    mockCall.mockResolvedValue({ message: [] });
    render(<CustomerData />);
    expect(screen.getByText("Customer Data")).toBeInTheDocument();
  });

  it("shows suggestions", async () => {
    mockCall.mockResolvedValueOnce({
      message: [{ name: "cust-001", customer_name: "John Doe", mobile_no: "9876543210" }],
    });
    render(<CustomerData />);
    await userEvent.type(screen.getByPlaceholderText("Search customer by name..."), "john");
    await waitFor(() => expect(screen.getByText("John Doe")).toBeInTheDocument());
  });

  it("fetches customer data", async () => {
    mockCall
      .mockResolvedValueOnce({ message: [{ name: "cust-001", customer_name: "John", mobile_no: null }] })
      .mockResolvedValueOnce({
        message: {
          invoices: [{ date: "2026-09-01", invoice: "INV-001", amount: 500 }],
          summary: { customer_name: "John", mobile_number: null, visit_count: 2, total_spend: 1250, avg_spend: 625, last_purchase_date: "2026-09-05" },
        },
      });
    render(<CustomerData />);
    await userEvent.type(screen.getByPlaceholderText("Search customer by name..."), "john");
    await userEvent.click(await screen.findByText("John"));
    await waitFor(() => expect(screen.getByText("INV-001")).toBeInTheDocument());
  });

  it("displays KPI", async () => {
    mockCall
      .mockResolvedValueOnce({ message: [{ name: "cust-001", customer_name: "John", mobile_no: null }] })
      .mockResolvedValueOnce({
        message: {
          invoices: [],
          summary: { customer_name: "John", mobile_number: null, visit_count: 5, total_spend: 2500, avg_spend: 500, last_purchase_date: "2026-09-09" },
        },
      });
    render(<CustomerData />);
    await userEvent.type(screen.getByPlaceholderText("Search customer by name..."), "john");
    await userEvent.click(await screen.findByText("John"));
    await waitFor(() => expect(screen.getByText("Visits")).toBeInTheDocument());
  });

  it("clears data on search change", async () => {
    mockCall
      .mockResolvedValueOnce({ message: [{ name: "cust-001", customer_name: "John", mobile_no: null }] })
      .mockResolvedValueOnce({
        message: {
          invoices: [{ date: "2026-09-01", invoice: "INV-001", amount: 500 }],
          summary: { customer_name: "John", mobile_number: null, visit_count: 1, total_spend: 500, avg_spend: 500, last_purchase_date: "2026-09-01" },
        },
      });
    render(<CustomerData />);
    await userEvent.type(screen.getByPlaceholderText("Search customer by name..."), "john");
    await userEvent.click(await screen.findByText("John"));
    await waitFor(() => expect(screen.getByText("INV-001")).toBeInTheDocument());
    const searchInput = screen.getByPlaceholderText("Search customer by name...");
    await userEvent.clear(searchInput);
    expect(screen.queryByText("INV-001")).not.toBeInTheDocument();
  });
});
