import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomerPicker } from "./CustomerPicker";

const searchCustomersMock = vi.fn();
const addCustomerMock = vi.fn();
vi.mock("../lib/customer-api", () => ({
  searchCustomers: (...a: any) => searchCustomersMock(...a),
  addCustomer: (...a: any) => addCustomerMock(...a),
  getCustomersByOrderType: vi.fn().mockResolvedValue([]),
}));
let mockPosProfile: { name: string; country: string } | null = null;
vi.mock("../store/pos-store", () => ({
  usePOSStore: () => ({
    customerGroups: [],
    territories: [],
    fetchCustomerGroups: vi.fn().mockResolvedValue([]),
    fetchTerritories: vi.fn().mockResolvedValue([]),
    posProfile: mockPosProfile,
  }),
}));
vi.mock("../i18n", () => ({ t: (key: string) => key }));

describe("CustomerPicker", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockPosProfile = null;
  });
  
  it("renders search input when no customer selected", () => {
    render(<CustomerPicker value={null} onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText("customer.search_placeholder")).toBeInTheDocument();
  });

  it("displays selected customer info", () => {
    render(<CustomerPicker value={{ id: "C1", name: "John", phone: "9999999999" }} onChange={vi.fn()} />);
    expect(screen.getByText("John")).toBeInTheDocument();
    expect(screen.getByText("9999999999")).toBeInTheDocument();
  });

  it("calls onChange with null when change button clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CustomerPicker value={{ id: "C1", name: "John", phone: "9999999999" }} onChange={onChange} />);
    const changeButton = screen.getByRole("button", { name: /common.change/ });
    await user.click(changeButton);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("searches customers when input changes", async () => {
    searchCustomersMock.mockResolvedValue([{ name: "CUST-001", content: "Customer Name : John Doe|Mobile Number : 9999999999" }]);
    const user = userEvent.setup();
    render(<CustomerPicker value={null} onChange={vi.fn()} />);
    const input = screen.getByPlaceholderText("customer.search_placeholder");
    await user.type(input, "John");
    await waitFor(() => { expect(searchCustomersMock).toHaveBeenCalled(); });
  });

  it("disables input when disabled prop is true", () => {
    render(<CustomerPicker value={null} onChange={vi.fn()} disabled={true} />);
    const input = screen.getByPlaceholderText("customer.search_placeholder");
    expect(input).toBeDisabled();
  });

  it("handles search errors gracefully", async () => {
    searchCustomersMock.mockRejectedValue(new Error("Search failed"));
    const user = userEvent.setup();
    render(<CustomerPicker value={null} onChange={vi.fn()} />);
    const input = screen.getByPlaceholderText("customer.search_placeholder");
    await user.click(input);
    await user.type(input, "test");
    await waitFor(() => { expect(screen.getByText("customer.failed_search")).toBeInTheDocument(); });
  });

  it("calls onChange when customer selected", async () => {
    const onChange = vi.fn();
    searchCustomersMock.mockResolvedValue([{ name: "CUST-001", content: "Customer Name : John Doe|Mobile Number : 9999999999" }]);
    const user = userEvent.setup();
    render(<CustomerPicker value={null} onChange={onChange} />);
    const input = screen.getByPlaceholderText("customer.search_placeholder");
    await user.click(input);
    await user.type(input, "John");
    await waitFor(() => { expect(screen.getByText("John Doe")).toBeInTheDocument(); });
    await user.click(screen.getByText("John Doe"));
    expect(onChange).toHaveBeenCalled();
  });

  it("validates mobile number against POS Profile country (India) and displays error", async () => {
    mockPosProfile = { name: "POS-India", country: "India" };
    searchCustomersMock.mockResolvedValue([]);
    addCustomerMock.mockResolvedValue({
      data: { name: "CUST-002", customer_name: "Rahul Sharma", mobile_number: "9876543210" },
    });

    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CustomerPicker value={null} onChange={onChange} />);

    const searchInput = screen.getByPlaceholderText("customer.search_placeholder");
    await user.click(searchInput);
    await user.type(searchInput, "Rahul");

    const addNewBtn = await screen.findByText("customer.add_new");
    await user.click(addNewBtn);

    const nameInput = screen.getByLabelText(/customer\.name_label/);
    const phoneInput = screen.getByLabelText(/customer\.phone_label/);

    expect(nameInput).toHaveValue("Rahul");
    // Mobile number field should show country code +91 as already entered
    expect(phoneInput).toHaveValue("+91");

    // Enter invalid phone number for India
    await user.clear(phoneInput);
    await user.type(phoneInput, "+9112345");
    const submitBtn = screen.getByRole("button", { name: "customer.add_button" });
    await user.click(submitBtn);

    // Should display validation error and not call addCustomer
    expect(await screen.findByText("Invalid mobile number for India")).toBeInTheDocument();
    expect(addCustomerMock).not.toHaveBeenCalled();

    // Now fix to valid 10-digit India number
    await user.clear(phoneInput);
    await user.type(phoneInput, "+919876543210");
    await user.click(submitBtn);

    await waitFor(() => {
      expect(addCustomerMock).toHaveBeenCalledWith({
        customer_name: "Rahul",
        mobile_number: "+919876543210",
        pos_profile: "POS-India",
      });
    });
    expect(onChange).toHaveBeenCalledWith({
      id: "CUST-002",
      name: "Rahul Sharma",
      phone: "9876543210",
    });
  });

  it("validates UAE mobile numbers correctly and displays error", async () => {
    mockPosProfile = { name: "POS-UAE", country: "United Arab Emirates" };
    searchCustomersMock.mockResolvedValue([]);

    const user = userEvent.setup();
    render(<CustomerPicker value={null} onChange={vi.fn()} />);

    const searchInput = screen.getByPlaceholderText("customer.search_placeholder");
    await user.click(searchInput);
    await user.type(searchInput, "Ahmed");

    const addNewBtn = await screen.findByText("customer.add_new");
    await user.click(addNewBtn);

    const phoneInput = screen.getByLabelText(/customer\.phone_label/);
    // Mobile number field should show country code +971 as already entered
    expect(phoneInput).toHaveValue("+971");

    await user.clear(phoneInput);
    await user.type(phoneInput, "+97112345");

    const submitBtn = screen.getByRole("button", { name: "customer.add_button" });
    await user.click(submitBtn);

    expect(await screen.findByText("Invalid mobile number for United Arab Emirates")).toBeInTheDocument();
    expect(addCustomerMock).not.toHaveBeenCalled();
  });
});

