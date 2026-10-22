import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import PrinterConfigPage from "./PrinterConfigPage";

vi.mock("../../context/BranchContext", () => ({
  useBranchContext: () => ({
    activeBranchId: "Kozhikode",
    branches: [{ id: "Kozhikode", name: "Kozhikode" }],
  }),
}));

const mockCall = vi.hoisted(() => vi.fn());

vi.mock("@ury/core", () => ({
  call: (...args: unknown[]) => mockCall(...(args as [string, unknown])),
}));

const networkPrinters = [
  { name: "Kitchen Printer", server_ip: "192.168.1.10", port: 631, printer_name: "EPSON Kitchen" },
  { name: "Bar Printer", server_ip: "192.168.1.20", port: 631, printer_name: "EPSON Bar" },
];

const printFormats = [
  { name: "POS Invoice Classic", doc_type: "POS Invoice" },
  { name: "KOT Format", doc_type: "URY KOT" },
];

const letterHeads = [{ name: "Standard Letterhead" }];
const printHeadings = [{ name: "Standard Heading" }];
const terms = [{ name: "Standard Terms" }];

const posProfiles = [{ name: "Main POS", branch: "Kozhikode" }];

const productionUnits = [
  { name: "Kitchen Unit", production: "Kitchen", department: "Kitchen Dept", branch: "Kozhikode" },
];

const rooms = [
  { name: "Main Hall", room_type: "AC", branch: "Kozhikode" },
  { name: "Terrace", room_type: "NON-AC", branch: "Kozhikode" },
];

const fullDocs: Record<string, any> = {
  "POS Profile:Main POS": {
    name: "Main POS",
    print_format: "POS Invoice Classic",
    letter_head: "",
    tc_name: "",
    select_print_heading: "",
    qz_print: 0,
    qz_host: "",
    custom_enable_kot_reprint: 0,
    custom_reprint_kot_format: "",
    custom_table_order_printer: "",
    custom_parcel_order_printer: "",
    printer_settings: [
      {
        name: "ps-pos-1",
        bill: 1,
        custom_kot_print: 0,
        custom_waiter_print: 0,
        printer: "Kitchen Printer",
        custom_kot_print_format: "",
        custom_waiter_print_format: "",
      },
    ],
  },
  "URY Production Unit:Kitchen Unit": {
    name: "Kitchen Unit",
    production: "Kitchen",
    department: "Kitchen Dept",
    printer_settings: [
      {
        name: "ps-unit-1",
        bill: 1,
        custom_kot_print: 0,
        custom_waiter_print: 0,
        printer: "Kitchen Printer",
        custom_kot_print_format: "",
        custom_waiter_print_format: "",
        custom_block_takeaway_kot: 0,
      },
    ],
  },
  "URY Room:Main Hall": {
    name: "Main Hall",
    kot_printing: 1,
    block_takeaway: 0,
    print_format: "",
    printer_settings: [
      {
        name: "ps-room-1",
        bill: 1,
        custom_kot_print: 1,
        custom_waiter_print: 0,
        printer: "Kitchen Printer",
        custom_kot_print_format: "KOT Format",
        custom_waiter_print_format: "",
      },
    ],
  },
  "URY Room:Terrace": {
    name: "Terrace",
    kot_printing: 0,
    block_takeaway: 1,
    print_format: "",
    printer_settings: [],
  },
};

function mockFetchImplementation() {
  mockCall.mockImplementation(async (method: string, params: any) => {
    if (method === "frappe.client.get_list") {
      switch (params?.doctype) {
        case "Network Printer Settings":
          return networkPrinters;
        case "Print Format":
          return printFormats;
        case "Letter Head":
          return letterHeads;
        case "Print Heading":
          return printHeadings;
        case "Terms and Conditions":
          return terms;
        case "POS Profile":
          return posProfiles;
        case "URY Production Unit":
          return productionUnits;
        case "URY Room":
          return rooms;
        default:
          return [];
      }
    }
    if (method === "frappe.client.get") {
      return fullDocs[`${params?.doctype}:${params?.name}`] ?? null;
    }
    if (method === "frappe.client.set_value") {
      return params;
    }
    if (method === "frappe.client.insert") {
      return params?.doc ?? {};
    }
    if (method === "frappe.client.delete") {
      return {};
    }
    return {};
  });
}

const section = (testId: string) => within(screen.getByTestId(testId));

describe("PrinterConfigPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchImplementation();
  });

  it("renders page title and description", async () => {
    render(<PrinterConfigPage />);
    expect(screen.getByText("Printer Configuration")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Manage network printers and printer assignments across POS Profiles, Production Units, and Rooms."
      )
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Kozhikode")).toBeInTheDocument());
  });

  it("renders all four sections simultaneously without tabs", async () => {
    render(<PrinterConfigPage />);

    await waitFor(() => expect(screen.getByTestId("printer-section-network")).toBeInTheDocument());
    expect(screen.getByTestId("printer-section-pos-profile")).toBeInTheDocument();
    expect(screen.getByTestId("printer-section-production-unit")).toBeInTheDocument();
    expect(screen.getByTestId("printer-section-room")).toBeInTheDocument();

    // No tab switcher remains.
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();

    // Each section heading is visible at once.
    expect(screen.getByRole("heading", { name: "Network Printers" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "POS Profile Printer Settings" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "URY Production Unit Printer Settings" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "URY Room Printer Settings" })).toBeInTheDocument();

    // Each section's default record is selected simultaneously.
    await waitFor(() => expect(screen.getByDisplayValue("Main POS")).toBeInTheDocument());
    expect(screen.getByDisplayValue("Kitchen Unit")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Main Hall")).toBeInTheDocument();
  });

  it("loads and lists records for the active branch", async () => {
    render(<PrinterConfigPage />);
    await waitFor(() => expect(screen.getByDisplayValue("Main POS")).toBeInTheDocument());
    expect(mockCall).toHaveBeenCalledWith(
      "frappe.client.get_list",
      expect.objectContaining({
        doctype: "POS Profile",
        filters: [["branch", "=", "Kozhikode"]],
      })
    );
  });

  it("displays the network printers table", async () => {
    render(<PrinterConfigPage />);
    const network = await screen.findByTestId("printer-section-network");
    await within(network).findByText("Kitchen Printer");
    expect(within(network).getByText("Bar Printer")).toBeInTheDocument();
    expect(within(network).getByText("192.168.1.10")).toBeInTheDocument();
    expect(within(network).getByText("192.168.1.20")).toBeInTheDocument();
    expect(within(network).getByText("EPSON Kitchen")).toBeInTheDocument();
  });

  it("shows an empty state when no network printers are configured", async () => {
    mockCall.mockImplementation(async (method: string, params: any) => {
      if (method === "frappe.client.get_list") {
        if (params?.doctype === "Network Printer Settings") return [];
        if (params?.doctype === "POS Profile") return posProfiles;
        if (params?.doctype === "URY Production Unit") return productionUnits;
        if (params?.doctype === "URY Room") return rooms;
        return [];
      }
      if (method === "frappe.client.get") {
        return fullDocs[`${params?.doctype}:${params?.name}`] ?? null;
      }
      return {};
    });

    render(<PrinterConfigPage />);
    const network = await screen.findByTestId("printer-section-network");
    await within(network).findByText("No network printers configured.");
  });

  it("creates a network printer through the add modal", async () => {
    render(<PrinterConfigPage />);
    const network = await screen.findByTestId("printer-section-network");

    fireEvent.click(within(network).getByRole("button", { name: /Add Network Printer/ }));
    const dialog = await screen.findByRole("dialog");

    fireEvent.change(document.getElementById("np-name")!, { target: { value: "Cashier Printer" } });
    fireEvent.change(document.getElementById("np-server-ip")!, { target: { value: "192.168.1.30" } });
    fireEvent.change(document.getElementById("np-port")!, { target: { value: "631" } });
    fireEvent.change(document.getElementById("np-printer-name")!, { target: { value: "EPSON Cashier" } });

    fireEvent.click(within(dialog).getByRole("button", { name: /Add Printer/ }));

    await waitFor(() =>
      expect(mockCall).toHaveBeenCalledWith(
        "frappe.client.insert",
        expect.objectContaining({
          doc: expect.objectContaining({
            doctype: "Network Printer Settings",
            name: "Cashier Printer",
            server_ip: "192.168.1.30",
            port: 631,
            printer_name: "EPSON Cashier",
          }),
        })
      )
    );
  });

  it("deletes a network printer after confirmation", async () => {
    render(<PrinterConfigPage />);
    const network = await screen.findByTestId("printer-section-network");

    fireEvent.click(await within(network).findByRole("button", { name: "Delete printer Bar Printer" }));
    const dialog = await screen.findByRole("dialog");

    fireEvent.click(within(dialog).getByRole("button", { name: /Delete/ }));

    await waitFor(() =>
      expect(mockCall).toHaveBeenCalledWith(
        "frappe.client.delete",
        expect.objectContaining({
          doctype: "Network Printer Settings",
          name: "Bar Printer",
        })
      )
    );
  });

  it("switches record selection within a section", async () => {
    render(<PrinterConfigPage />);
    await waitFor(() => expect(screen.getByDisplayValue("Main POS")).toBeInTheDocument());

    fireEvent.change(screen.getByDisplayValue("Main Hall"), { target: { value: "Terrace" } });
    await waitFor(() =>
      expect(mockCall).toHaveBeenCalledWith(
        "frappe.client.get",
        expect.objectContaining({ doctype: "URY Room", name: "Terrace" })
      )
    );
  });

  it("adds and removes child table rows in the POS Profile section", async () => {
    render(<PrinterConfigPage />);
    const pos = await screen.findByTestId("printer-section-pos-profile");
    await waitFor(() => expect(screen.getByDisplayValue("Main POS")).toBeInTheDocument());

    expect(document.getElementById("pos-printer-row-0")).not.toBeNull();
    expect(document.getElementById("pos-printer-row-1")).toBeNull();

    fireEvent.click(within(pos).getByRole("button", { name: /Add Row/ }));
    expect(document.getElementById("pos-printer-row-1")).not.toBeNull();

    fireEvent.click(within(pos).getByRole("button", { name: "POS delete row 2" }));
    expect(document.getElementById("pos-printer-row-1")).toBeNull();
  });

  it("saves POS Profile changes independently via frappe.client.set_value", async () => {
    render(<PrinterConfigPage />);
    const pos = await screen.findByTestId("printer-section-pos-profile");
    await waitFor(() => expect(screen.getByDisplayValue("Main POS")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("switch", { name: "QZ Print" }));
    fireEvent.click(within(pos).getByRole("button", { name: "Save Changes" }));

    await waitFor(() =>
      expect(mockCall).toHaveBeenCalledWith(
        "frappe.client.set_value",
        expect.objectContaining({
          doctype: "POS Profile",
          name: "Main POS",
          fieldname: expect.objectContaining({ qz_print: 1 }),
        })
      )
    );
  });

  it("saves Production Unit printer settings independently via frappe.client.set_value", async () => {
    render(<PrinterConfigPage />);
    const unit = await screen.findByTestId("printer-section-production-unit");
    await waitFor(() => expect(screen.getByDisplayValue("Kitchen Unit")).toBeInTheDocument());
    expect(within(unit).getByText("Kitchen Dept")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Unit row 1 KOT print" }));
    fireEvent.click(within(unit).getByRole("button", { name: "Save Changes" }));

    await waitFor(() =>
      expect(mockCall).toHaveBeenCalledWith(
        "frappe.client.set_value",
        expect.objectContaining({
          doctype: "URY Production Unit",
          name: "Kitchen Unit",
          fieldname: expect.objectContaining({
            printer_settings: expect.arrayContaining([
              expect.objectContaining({ name: "ps-unit-1", custom_kot_print: 1 }),
            ]),
          }),
        })
      )
    );
  });

  it("saves Room changes independently via frappe.client.set_value", async () => {
    render(<PrinterConfigPage />);
    const room = await screen.findByTestId("printer-section-room");
    await waitFor(() => expect(screen.getByDisplayValue("Main Hall")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("switch", { name: "Block Takeaway Orders" }));
    fireEvent.click(within(room).getByRole("button", { name: "Save Changes" }));

    await waitFor(() =>
      expect(mockCall).toHaveBeenCalledWith(
        "frappe.client.set_value",
        expect.objectContaining({
          doctype: "URY Room",
          name: "Main Hall",
          fieldname: expect.objectContaining({ block_takeaway: 1, kot_printing: 1 }),
        })
      )
    );
  });

  it("does not save a section without changes", async () => {
    render(<PrinterConfigPage />);
    const pos = await screen.findByTestId("printer-section-pos-profile");
    await waitFor(() => expect(screen.getByDisplayValue("Main POS")).toBeInTheDocument());

    fireEvent.click(within(pos).getByRole("button", { name: "Save Changes" }));

    await new Promise((r) => setTimeout(r, 50));
    expect(mockCall).not.toHaveBeenCalledWith(
      "frappe.client.set_value",
      expect.objectContaining({ doctype: "POS Profile" })
    );
  });

  it("renders empty states for sections without records in the branch", async () => {
    mockCall.mockImplementation(async (method: string, params: any) => {
      if (method === "frappe.client.get_list") {
        if (params?.doctype === "Network Printer Settings") return networkPrinters;
        return [];
      }
      return {};
    });

    render(<PrinterConfigPage />);
    const pos = await screen.findByTestId("printer-section-pos-profile");
    await within(pos).findByText("No POS Profiles for this branch");
    expect(within(screen.getByTestId("printer-section-production-unit")).getByText("No Production Units for this branch")).toBeInTheDocument();
    expect(within(screen.getByTestId("printer-section-room")).getByText("No Rooms for this branch")).toBeInTheDocument();
    // Network printers are not branch-scoped and still render.
    expect(within(screen.getByTestId("printer-section-network")).getByText("Kitchen Printer")).toBeInTheDocument();
  });

  it("renders an error state when the initial fetch fails", async () => {
    mockCall.mockRejectedValue(new Error("network down"));

    render(<PrinterConfigPage />);
    await waitFor(() =>
      expect(screen.getByText("Failed to load printer configuration")).toBeInTheDocument()
    );
    expect(screen.getByText("network down")).toBeInTheDocument();
  });
});
