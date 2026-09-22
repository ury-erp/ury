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

// Routes by method name rather than call order -- the page now fires a
// listing call (get_daywise_customer_details) on mount ahead of anything the
// user types, so a queue of mockResolvedValueOnce calls keyed to call order
// would silently attach the wrong response to the wrong request.
const mockResponses = (overrides: Record<string, unknown>) => {
  mockCall.mockImplementation((method: string) => {
    if (method in overrides) return Promise.resolve(overrides[method]);
    if (method === "ury.ury.report_api.customers.get_daywise_customer_details") {
      return Promise.resolve({ message: { customers: [] } });
    }
    if (method === "ury.ury.report_api.customers.search_customers") {
      return Promise.resolve({ message: [] });
    }
    return Promise.resolve({ message: null });
  });
};

describe("CustomerData", () => {
  beforeEach(() => {
    cleanup();
    mockCall.mockReset();
  });

  it("renders header", () => {
    mockResponses({});
    render(<CustomerData />);
    expect(screen.getByText("Customer Data")).toBeInTheDocument();
  });

  it("shows suggestions", async () => {
    mockResponses({
      "ury.ury.report_api.customers.search_customers": {
        message: [{ name: "cust-001", customer_name: "John Doe", mobile_no: "9876543210" }],
      },
    });
    render(<CustomerData />);
    await userEvent.type(screen.getByPlaceholderText("Search customer by name..."), "john");
    await waitFor(() => expect(screen.getByText("John Doe")).toBeInTheDocument());
  });

  it("fetches customer data", async () => {
    mockResponses({
      "ury.ury.report_api.customers.search_customers": {
        message: [{ name: "cust-001", customer_name: "John", mobile_no: null }],
      },
      "ury.ury.report_api.customers.get_customer_data": {
        message: {
          invoices: [{ date: "2026-09-01", invoice: "INV-001", amount: 500 }],
          summary: { customer_name: "John", mobile_number: null, visit_count: 2, total_spend: 1250, avg_spend: 625, last_purchase_date: "2026-09-05" },
        },
      },
    });
    render(<CustomerData />);
    await userEvent.type(screen.getByPlaceholderText("Search customer by name..."), "john");
    await userEvent.click(await screen.findByText("John"));
    await waitFor(() => expect(screen.getByText("INV-001")).toBeInTheDocument());
  });

  it("displays KPI", async () => {
    mockResponses({
      "ury.ury.report_api.customers.search_customers": {
        message: [{ name: "cust-001", customer_name: "John", mobile_no: null }],
      },
      "ury.ury.report_api.customers.get_customer_data": {
        message: {
          invoices: [],
          summary: { customer_name: "John", mobile_number: null, visit_count: 5, total_spend: 2500, avg_spend: 500, last_purchase_date: "2026-09-09" },
        },
      },
    });
    render(<CustomerData />);
    await userEvent.type(screen.getByPlaceholderText("Search customer by name..."), "john");
    await userEvent.click(await screen.findByText("John"));
    await waitFor(() => expect(screen.getByText("Visits")).toBeInTheDocument());
  });

  it("clears data on search change", async () => {
    mockResponses({
      "ury.ury.report_api.customers.search_customers": {
        message: [{ name: "cust-001", customer_name: "John", mobile_no: null }],
      },
      "ury.ury.report_api.customers.get_customer_data": {
        message: {
          invoices: [{ date: "2026-09-01", invoice: "INV-001", amount: 500 }],
          summary: { customer_name: "John", mobile_number: null, visit_count: 1, total_spend: 500, avg_spend: 500, last_purchase_date: "2026-09-01" },
        },
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

  describe("default customer listing", () => {
    it("renders every customer who visited in range instead of an empty prompt", async () => {
      mockResponses({
        "ury.ury.report_api.customers.get_daywise_customer_details": {
          message: {
            customers: [
              {
                customer_id: "CUST-001",
                customer_name: "fairooz",
                mobile_number: "9000000001",
                visit_count: 429,
                first_visit: "2026-08-01",
                last_visit: "2026-09-20",
              },
              {
                customer_id: "CUST-002",
                customer_name: "Fairooz BZ",
                mobile_number: "9000000002",
                visit_count: 170,
                first_visit: "2026-08-05",
                last_visit: "2026-09-19",
              },
            ],
          },
        },
      });

      render(<CustomerData />);

      await waitFor(() => expect(screen.getByText("fairooz")).toBeInTheDocument());
      // Both rows render as distinct customers despite the similar display name.
      expect(screen.getByText("Fairooz BZ")).toBeInTheDocument();
      expect(screen.queryByText("Search and select a customer to view their history.")).not.toBeInTheDocument();
    });

    it("selects a customer from the listing and loads their history", async () => {
      mockResponses({
        "ury.ury.report_api.customers.get_daywise_customer_details": {
          message: {
            customers: [
              {
                customer_id: "CUST-001",
                customer_name: "Meera",
                mobile_number: "9000000003",
                visit_count: 153,
                first_visit: "2026-08-01",
                last_visit: "2026-09-20",
              },
            ],
          },
        },
        "ury.ury.report_api.customers.get_customer_data": {
          message: {
            invoices: [{ date: "2026-09-01", invoice: "INV-500", amount: 750 }],
            summary: { customer_name: "Meera", mobile_number: "9000000003", visit_count: 153, total_spend: 90000, avg_spend: 588, last_purchase_date: "2026-09-20" },
          },
        },
      });

      render(<CustomerData />);

      await waitFor(() => expect(screen.getByText("Meera")).toBeInTheDocument());
      await userEvent.click(screen.getByText("Meera"));

      await waitFor(() => expect(screen.getByText("INV-500")).toBeInTheDocument());
      expect(mockCall).toHaveBeenCalledWith(
        "ury.ury.report_api.customers.get_customer_data",
        expect.objectContaining({ customer: "Meera" }),
      );
    });

    it("surfaces a listing error instead of silently rendering an empty table", async () => {
      mockCall.mockImplementation((method: string) => {
        if (method === "ury.ury.report_api.customers.get_daywise_customer_details") {
          return Promise.reject(new Error("Customer listing failed"));
        }
        return Promise.resolve({ message: [] });
      });

      render(<CustomerData />);

      await waitFor(() => expect(screen.getByText("Customer listing failed")).toBeInTheDocument());
    });
  });
});
