import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmployeeItemWiseSales } from "./EmployeeItemWiseSales";

vi.mock("../../context/BranchContext", () => ({
  useBranchContext: () => ({ activeBranchId: "Kozhikode" }),
}));

vi.mock("@ury/core", () => ({
  call: vi.fn(),
  formatCurrency: (val) => (val ?? 0).toString(),
}));

import { call } from "@ury/core";

describe("EmployeeItemWiseSales", () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(call).mockClear();
  });

  it("renders page title", () => {
    vi.mocked(call).mockResolvedValue({
      message: { employee_name: "", items: [], summary: {} }
    });
    render(<EmployeeItemWiseSales />);
    expect(screen.getByText("Employee Item Wise Sales")).toBeInTheDocument();
  });

  it("shows loading state when fetching", async () => {
    let callCount = 0;
    vi.mocked(call).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Search employees call
        return Promise.resolve({ message: [{ name: "EMP-001", full_name: "Alice" }] });
      }
      // Data call - never resolves to keep loading state
      return new Promise(() => {});
    });
    
    const user = userEvent.setup();
    render(<EmployeeItemWiseSales />);
    const searchInput = screen.getByPlaceholderText(/Search employee/i);
    await user.type(searchInput, "Al");
    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });
    
    const suggestionButton = screen.getByRole("button", { name: "Alice" });
    await user.click(suggestionButton);
    
    await waitFor(() => {
      expect(screen.getByText(/Loading/)).toBeInTheDocument();
    });
  });

  it("displays employee search box", () => {
    vi.mocked(call).mockResolvedValue({
      message: { employee_name: "", items: [], summary: {} }
    });
    render(<EmployeeItemWiseSales />);
    const searchInput = screen.getByPlaceholderText(/Search employee/i);
    expect(searchInput).toBeInTheDocument();
  });

  it("displays items sold when employee data loads", async () => {
    let callCount = 0;
    vi.mocked(call).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Search employees call
        return Promise.resolve({ message: [{ name: "EMP-001", full_name: "Alice" }] });
      }
      // Data call
      return Promise.resolve({
        message: {
          employee_name: "Alice",
          items: [{
            item_code: "ITEM-001", item_name: "Biryani",
            item_group: "Main Courses", qty: 25, amount: 5000
          }],
          summary: { total_qty: 25, total_amount: 5000 }
        }
      });
    });
    
    const user = userEvent.setup();
    render(<EmployeeItemWiseSales />);
    const searchInput = screen.getByPlaceholderText(/Search employee/i);
    await user.type(searchInput, "Al");
    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });
    
    const suggestionButton = screen.getByRole("button", { name: "Alice" });
    await user.click(suggestionButton);
    
    await waitFor(() => {
      expect(screen.getByText("Biryani")).toBeInTheDocument();
    });
  });

  it("renders without crashing on empty items", async () => {
    vi.mocked(call).mockResolvedValue({
      message: { employee_name: "", items: [], summary: {} }
    });
    render(<EmployeeItemWiseSales />);
    await waitFor(() => {
      expect(screen.getByText("Employee Item Wise Sales")).toBeInTheDocument();
    });
  });
});
