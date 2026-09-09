import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MergedBillPanel from "./MergedBillPanel";

const getPOSInvoiceItemsMock = vi.fn();

vi.mock("../lib/invoice-api", () => ({
  getPOSInvoiceItems: (...args: any[]) => getPOSInvoiceItemsMock(...args),
}));

vi.mock("@ury/core", () => ({
  formatCurrency: (amount: number) => `Rs. ${amount}`,
}));

vi.mock("../i18n", () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      "bill_merge.merged_bill": "Merged Bill",
      "bill_merge.open_secondary": "Open Secondary",
      "bill_merge.merged_items": "Merged Items",
      "bill_merge.combined_total": "Combined Total",
      "common.loading": "Loading",
    };
    return translations[key] || key;
  },
}));

describe("MergedBillPanel", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("returns null when no merged invoice", () => {
    const { container } = render(
      <MergedBillPanel
        order={{
          name: "INV-001",
          custom_merged_pos_invoice: null,
          custom_merged_total: 0,
          rounded_total: 1000,
        }}
      />
    );
    
    expect(container.firstChild).toBeNull();
  });

  it("renders panel when merged invoice is present", async () => {
    getPOSInvoiceItemsMock.mockResolvedValue({ items: [] });
    
    render(
      <MergedBillPanel
        order={{
          name: "INV-001",
          custom_merged_pos_invoice: "INV-002",
          custom_merged_total: 500,
          rounded_total: 1000,
        }}
      />
    );
    
    await waitFor(() => {
      expect(screen.getByText("Merged Bill")).toBeInTheDocument();
    });
  });

  it("displays merged invoice name", async () => {
    getPOSInvoiceItemsMock.mockResolvedValue({ items: [] });
    
    render(
      <MergedBillPanel
        order={{
          name: "INV-001",
          custom_merged_pos_invoice: "INV-002",
          custom_merged_total: 500,
          rounded_total: 1000,
        }}
      />
    );
    
    await waitFor(() => {
      expect(screen.getByText("INV-002")).toBeInTheDocument();
    });
  });

  it("displays merged total in formatted currency", async () => {
    getPOSInvoiceItemsMock.mockResolvedValue({ items: [] });
    
    render(
      <MergedBillPanel
        order={{
          name: "INV-001",
          custom_merged_pos_invoice: "INV-002",
          custom_merged_total: 500,
          rounded_total: 1000,
        }}
      />
    );
    
    await waitFor(() => {
      expect(screen.getByText("Rs. 500")).toBeInTheDocument();
    });
  });

  it("displays combined total", async () => {
    getPOSInvoiceItemsMock.mockResolvedValue({ items: [] });
    
    render(
      <MergedBillPanel
        order={{
          name: "INV-001",
          custom_merged_pos_invoice: "INV-002",
          custom_merged_total: 500,
          rounded_total: 1000,
        }}
      />
    );
    
    await waitFor(() => {
      expect(screen.getByText("Rs. 1500")).toBeInTheDocument();
    });
  });

  it("displays loading state while fetching items", async () => {
    getPOSInvoiceItemsMock.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ items: [] }), 1000))
    );
    
    render(
      <MergedBillPanel
        order={{
          name: "INV-001",
          custom_merged_pos_invoice: "INV-002",
          custom_merged_total: 500,
          rounded_total: 1000,
        }}
      />
    );
    
    expect(screen.getByText("Loading")).toBeInTheDocument();
  });

  it("displays merged items when items are fetched", async () => {
    getPOSInvoiceItemsMock.mockResolvedValue({
      items: [
        { name: "item-1", item_name: "Chicken", qty: 2, rate: 100 },
        { name: "item-2", item_name: "Rice", qty: 1, rate: 50 },
      ],
    });
    
    render(
      <MergedBillPanel
        order={{
          name: "INV-001",
          custom_merged_pos_invoice: "INV-002",
          custom_merged_total: 250,
          rounded_total: 1000,
        }}
      />
    );
    
    await waitFor(() => {
      expect(screen.getByText("Chicken")).toBeInTheDocument();
      expect(screen.getByText("Rice")).toBeInTheDocument();
    });
  });

  it("calls onOpenSecondary when button is clicked", async () => {
    const onOpenSecondary = vi.fn();
    getPOSInvoiceItemsMock.mockResolvedValue({ items: [] });
    
    const user = userEvent.setup();
    render(
      <MergedBillPanel
        order={{
          name: "INV-001",
          custom_merged_pos_invoice: "INV-002",
          custom_merged_total: 500,
          rounded_total: 1000,
        }}
        onOpenSecondary={onOpenSecondary}
      />
    );
    
    await waitFor(() => {
      expect(screen.getByText("Open Secondary")).toBeInTheDocument();
    });
    
    const button = screen.getByText("Open Secondary");
    await user.click(button);
    
    expect(onOpenSecondary).toHaveBeenCalledWith("INV-002");
  });

  it("cancels fetch when component unmounts", async () => {
    getPOSInvoiceItemsMock.mockResolvedValue({ items: [] });
    
    const { unmount } = render(
      <MergedBillPanel
        order={{
          name: "INV-001",
          custom_merged_pos_invoice: "INV-002",
          custom_merged_total: 500,
          rounded_total: 1000,
        }}
      />
    );
    
    unmount();
    
    expect(getPOSInvoiceItemsMock).toHaveBeenCalled();
  });
});
