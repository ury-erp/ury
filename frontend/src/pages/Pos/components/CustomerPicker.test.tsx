import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomerPicker } from "./CustomerPicker";

const searchCustomersMock = vi.fn();
const addCustomerMock = vi.fn();
vi.mock("../lib/customer-api", () => ({ searchCustomers: (...a: any) => searchCustomersMock(...a), addCustomer: (...a: any) => addCustomerMock(...a) }));
vi.mock("../store/pos-store", () => ({ usePOSStore: () => ({ customerGroups: [], territories: [], fetchCustomerGroups: vi.fn(), fetchTerritories: vi.fn() }) }));
vi.mock("../i18n", () => ({ t: (key: string) => key }));

describe("CustomerPicker", () => {
  beforeEach(() => { cleanup(); vi.clearAllMocks(); });
  
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
});
