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

// Routes by method name rather than call order -- the page now fires a
// listing call (get_employee_sales) on mount ahead of anything the user
// types, so a call-count-indexed queue of responses would silently attach
// the wrong response to the wrong request.
const mockResponses = (overrides: Record<string, unknown>) => {
  vi.mocked(call).mockImplementation((method: unknown) => {
    const key = method as string;
    if (key in overrides) return Promise.resolve(overrides[key]);
    if (key === "ury.ury.report_api.employees.get_employee_sales") {
      return Promise.resolve({ message: { employees: [] } });
    }
    if (key === "ury.ury.report_api.employees.search_employees") {
      return Promise.resolve({ message: [] });
    }
    return Promise.resolve({ message: null });
  });
};

describe("EmployeeItemWiseSales", () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(call).mockClear();
  });

  it("renders page title", () => {
    mockResponses({});
    render(<EmployeeItemWiseSales />);
    expect(screen.getByText("Employee Item Wise Sales")).toBeInTheDocument();
  });

  it("shows loading state when fetching", async () => {
    mockResponses({
      "ury.ury.report_api.employees.search_employees": {
        message: [{ name: "EMP-001", full_name: "Alice" }],
      },
      "ury.ury.report_api.employees.get_employee_item_wise_sales": new Promise(() => {}),
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
    mockResponses({});
    render(<EmployeeItemWiseSales />);
    const searchInput = screen.getByPlaceholderText(/Search employee/i);
    expect(searchInput).toBeInTheDocument();
  });

  it("displays items sold when employee data loads", async () => {
    mockResponses({
      "ury.ury.report_api.employees.search_employees": {
        message: [{ name: "EMP-001", full_name: "Alice" }],
      },
      "ury.ury.report_api.employees.get_employee_item_wise_sales": {
        message: {
          employee_name: "Alice",
          items: [{
            item_code: "ITEM-001", item_name: "Biryani",
            item_group: "Main Courses", qty: 25, amount: 5000
          }],
          summary: { total_qty: 25, total_amount: 5000 }
        }
      },
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
    mockResponses({});
    render(<EmployeeItemWiseSales />);
    await waitFor(() => {
      expect(screen.getByText("Employee Item Wise Sales")).toBeInTheDocument();
    });
  });

  describe("default employee listing", () => {
    it("renders the sales leaderboard instead of an empty prompt", async () => {
      mockResponses({
        "ury.ury.report_api.employees.get_employee_sales": {
          message: {
            employees: [
              { employee_id: "urycashier@gmail.com", employee_name: "URY Cashier", total_invoices: 3001, sales_amount: 500000 },
            ],
          },
        },
      });

      render(<EmployeeItemWiseSales />);

      await waitFor(() => expect(screen.getByText("URY Cashier")).toBeInTheDocument());
      expect(
        screen.queryByText("Search and select an employee to view their item breakdown."),
      ).not.toBeInTheDocument();
    });

    it("does not list every User account -- only who actually appears in get_employee_sales", async () => {
      // search_employees would return all Users (e.g. an admin account that
      // never rings up a sale); the default listing must come from
      // get_employee_sales instead, which only returns people who sold.
      mockResponses({
        "ury.ury.report_api.employees.search_employees": {
          message: [{ name: "admin@example.com", full_name: "Site Admin" }],
        },
        "ury.ury.report_api.employees.get_employee_sales": {
          message: {
            employees: [
              { employee_id: "urycashier@gmail.com", employee_name: "URY Cashier", total_invoices: 3001, sales_amount: 500000 },
            ],
          },
        },
      });

      render(<EmployeeItemWiseSales />);

      await waitFor(() => expect(screen.getByText("URY Cashier")).toBeInTheDocument());
      expect(screen.queryByText("Site Admin")).not.toBeInTheDocument();
    });

    it("selects an employee from the listing and loads their item breakdown", async () => {
      mockResponses({
        "ury.ury.report_api.employees.get_employee_sales": {
          message: {
            employees: [
              { employee_id: "urycashier@gmail.com", employee_name: "URY Cashier", total_invoices: 3001, sales_amount: 500000 },
            ],
          },
        },
        "ury.ury.report_api.employees.get_employee_item_wise_sales": {
          message: {
            employee_name: "URY Cashier",
            items: [{ item_code: "ITEM-001", item_name: "Biryani", item_group: "Main Courses", qty: 25, amount: 5000 }],
            summary: { total_qty: 25, total_amount: 5000 },
          },
        },
      });

      render(<EmployeeItemWiseSales />);

      await waitFor(() => expect(screen.getByText("URY Cashier")).toBeInTheDocument());
      await userEvent.click(screen.getByText("URY Cashier"));

      await waitFor(() => expect(screen.getByText("Biryani")).toBeInTheDocument());
      expect(call).toHaveBeenCalledWith(
        "ury.ury.report_api.employees.get_employee_item_wise_sales",
        expect.objectContaining({ employee: "urycashier@gmail.com" }),
      );
    });

    it("surfaces a listing error instead of silently rendering an empty table", async () => {
      vi.mocked(call).mockImplementation((method: unknown) => {
        if (method === "ury.ury.report_api.employees.get_employee_sales") {
          return Promise.reject(new Error("Employee listing failed"));
        }
        return Promise.resolve({ message: [] });
      });

      render(<EmployeeItemWiseSales />);

      await waitFor(() => expect(screen.getByText("Employee listing failed")).toBeInTheDocument());
    });
  });
});
