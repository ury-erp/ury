import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DaywiseCustomerDetails } from "./DaywiseCustomerDetails";

vi.mock("../../context/BranchContext", () => ({
  useBranchContext: () => ({ activeBranchId: "Kozhikode" }),
}));

const mockCall = vi.fn();
vi.mock("@ury/core", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    call: (...args) => mockCall(...args),
  };
});

describe("DaywiseCustomerDetails", () => {
  beforeEach(() => { cleanup(); mockCall.mockReset(); });

  it("renders header", async () => {
    mockCall.mockResolvedValue({ message: { customers: [], total_count: 0 } });
    render(<DaywiseCustomerDetails />);
    expect(screen.getByText("Daywise Customer Details")).toBeInTheDocument();
  });

  it("displays customer KPI", async () => {
    mockCall.mockResolvedValue({
      message: { customers: [], total_count: 25 },
    });
    render(<DaywiseCustomerDetails />);
    await waitFor(() => {
      expect(screen.getByText("Unique Customers")).toBeInTheDocument();
      expect(screen.getByText("25")).toBeInTheDocument();
    });
  });

  it("displays customers table", async () => {
    mockCall.mockResolvedValue({
      message: {
        customers: [
          { customer_id: "c-001", customer_name: "John Doe", mobile_number: "9876543210", visit_count: 5, first_visit: "2026-09-01", last_visit: "2026-09-09" },
        ],
        total_count: 1,
      },
    });
    render(<DaywiseCustomerDetails />);
    await waitFor(() => {
      expect(screen.getByText("John Doe")).toBeInTheDocument();
      expect(screen.getByText("9876543210")).toBeInTheDocument();
    });
  });

  it("disables export when no data", async () => {
    mockCall.mockResolvedValue({ message: { customers: [], total_count: 0 } });
    render(<DaywiseCustomerDetails />);
    const exportBtn = screen.getByText("Export CSV");
    expect(exportBtn).toBeDisabled();
  });

  it("enables export when data available", async () => {
    mockCall.mockResolvedValue({
      message: {
        customers: [
          { customer_id: "c-001", customer_name: "John", mobile_number: "9876543210", visit_count: 1, first_visit: "2026-09-01", last_visit: "2026-09-01" },
        ],
        total_count: 1,
      },
    });
    render(<DaywiseCustomerDetails />);
    await waitFor(() => {
      expect(screen.getByText("John")).toBeInTheDocument();
    });
    const exportBtn = screen.getByText("Export CSV");
    expect(exportBtn).not.toBeDisabled();
  });
});
