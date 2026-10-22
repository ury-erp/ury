import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import PrinterConfigPage from "./PrinterConfigPage";
import { dashboardService } from "../../services/dashboard";

vi.mock("../../context/BranchContext", () => ({
  useBranchContext: () => ({
    activeBranchId: "Kozhikode",
    branches: [{ id: "Kozhikode", name: "Kozhikode" }],
  }),
}));

vi.mock("../../services/dashboard", () => ({
  dashboardService: {
    getModuleRecords: vi.fn(),
  },
}));

const mockCall = vi.hoisted(() => vi.fn());

vi.mock("@ury/core", () => ({
  call: (...args: unknown[]) => mockCall(...(args as [string, unknown])),
}));

const networkPrinters = [{ name: "Kitchen Printer" }, { name: "Bar Printer" }];

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
    return {};
  });
}

describe("PrinterConfigPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchImplementation();
    vi.mocked(dashboardService.getModuleRecords).mockImplementation(async (doctype) =>
      doctype === "Network Printer Settings" ? networkPrinters : []
    );
  });

  it("renders page title and description", async () => {
    render(<PrinterConfigPage />);
    expect(screen.getByText("Printer Config")).toBeInTheDocument();
    expect(screen.getByText("Manage printer settings for the selected branch.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Kozhikode")).toBeInTheDocument());
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

  it("switches tabs between POS Profile, Production Unit and Room", async () => {
    render(<PrinterConfigPage />);
    await waitFor(() => expect(screen.getByDisplayValue("Main POS")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("radio", { name: "Production Unit" }));
    await waitFor(() => expect(screen.getByText("Kitchen Dept")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("radio", { name: "Room" }));
    await waitFor(() => expect(screen.getByDisplayValue("Main Hall")).toBeInTheDocument());
    expect(screen.getByRole("switch", { name: "Enable KOT Printing" })).toBeInTheDocument();
  });

  it("switches record selection", async () => {
    render(<PrinterConfigPage />);
    await waitFor(() => expect(screen.getByDisplayValue("Main POS")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("radio", { name: "Room" }));
    await waitFor(() => expect(screen.getByDisplayValue("Main Hall")).toBeInTheDocument());

    fireEvent.change(screen.getByDisplayValue("Main Hall"), { target: { value: "Terrace" } });
    await waitFor(() =>
      expect(mockCall).toHaveBeenCalledWith(
        "frappe.client.get",
        expect.objectContaining({ doctype: "URY Room", name: "Terrace" })
      )
    );
  });

  it("adds and removes child table rows", async () => {
    render(<PrinterConfigPage />);
    await waitFor(() => expect(screen.getByDisplayValue("Main POS")).toBeInTheDocument());

    expect(document.getElementById("printer-row-0")).not.toBeNull();
    expect(document.getElementById("printer-row-1")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Add Row/ }));
    expect(document.getElementById("printer-row-1")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Delete row 2" }));
    expect(document.getElementById("printer-row-1")).toBeNull();
  });

  it("saves POS Profile changes via frappe.client.set_value", async () => {
    render(<PrinterConfigPage />);
    await waitFor(() => expect(screen.getByDisplayValue("Main POS")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("switch", { name: "QZ Print" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

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

  it("saves Production Unit printer settings via frappe.client.set_value", async () => {
    render(<PrinterConfigPage />);
    await waitFor(() => expect(screen.getByDisplayValue("Main POS")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("radio", { name: "Production Unit" }));
    await waitFor(() => expect(screen.getByText("Kitchen Dept")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("switch", { name: "Row 1 KOT print" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

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

  it("saves Room changes via frappe.client.set_value", async () => {
    render(<PrinterConfigPage />);
    await waitFor(() => expect(screen.getByDisplayValue("Main POS")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("radio", { name: "Room" }));
    await waitFor(() => expect(screen.getByDisplayValue("Main Hall")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("switch", { name: "Block Takeaway Orders" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

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

  it("renders an empty state when no records exist for the branch", async () => {
    mockCall.mockImplementation(async (method: string, params: any) => {
      if (method === "frappe.client.get_list") {
        if (params?.doctype === "POS Profile") return [];
        if (params?.doctype === "URY Production Unit") return [];
        if (params?.doctype === "URY Room") return [];
        return [];
      }
      return {};
    });

    render(<PrinterConfigPage />);
    await waitFor(() =>
      expect(screen.getByText("No POS Profiles for this branch")).toBeInTheDocument()
    );
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
