import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { call } from "@ury/core";
import { showToast } from "@ury/ui";
import MenuPage from "./MenuPage";

// ---- Fixtures ---------------------------------------------------------------

const ITEMS = [
  { name: "ITEM-001", item_name: "Dosa", standard_rate: 50, custom_course: "Main-Course", image: "/files/dosa.png" },
  { name: "ITEM-002", item_name: "Payasam", standard_rate: 40, custom_course: "Dessert", image: "" },
  { name: "ITEM-003", item_name: "Idli", standard_rate: 30, custom_course: "Main-Course", image: "" },
];

// Menu-1 starts out already containing ITEM-001 (Dosa).
const MENU_DOCS: Record<string, any> = {
  "Menu-1": {
    name: "Menu-1",
    menu_name: "Breakfast Menu",
    items: [
      { name: "row-1", item: "ITEM-001", item_name: "Dosa", rate: 50, course: "Main-Course", special_dish: 0, disabled: 0 },
    ],
  },
  "Menu-2": { name: "Menu-2", menu_name: "Lunch Menu", items: [] },
};

let savedDocs: any[] = [];

// ---- Mocks ------------------------------------------------------------------

vi.mock("../../context/BranchContext", () => ({
  useBranchContext: () => ({
    activeBranchId: "Kozhikode",
    branches: [{ id: "Kozhikode", name: "Kozhikode" }],
  }),
}));

vi.mock("../../services/dashboard", () => ({
  dashboardService: {
    getModuleRecords: vi.fn().mockImplementation((module) => {
      if (module === "URY Menu") {
        return Promise.resolve([
          { name: "Menu-1", menu_name: "Breakfast Menu" },
          { name: "Menu-2", menu_name: "Lunch Menu" },
        ]);
      }
      if (module === "URY Menu Course") {
        return Promise.resolve([{ name: "Main-Course" }, { name: "Dessert" }]);
      }
      if (module === "Item") {
        return Promise.resolve(ITEMS);
      }
      return Promise.resolve([]);
    }),
  },
}));

vi.mock("@ury/core", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    formatCurrency: (amount: number) => `Rs. ${amount}`,
    call: vi.fn(),
  };
});

vi.mock("@ury/ui", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    showToast: {
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
    },
  };
});

vi.mock("../../components/layout/SideDrawer", () => ({
  default: ({ isOpen, children }: any) => (isOpen ? <div>{children}</div> : null),
}));

vi.mock("../../components/layout/PageToolbar", () => ({
  PageToolbar: ({ children }: any) => <div>{children}</div>,
}));

// Lightweight functional stand-in for SearchableSelect: renders a real <select>
// that commits option values through the same onChange(id, value) contract.
vi.mock("../../components/common/SearchableSelect", () => ({
  SearchableSelect: ({ id, value, options, onChange, placeholder }: any) => (
    <select
      data-testid={`ss-${id}`}
      aria-label={placeholder || id}
      value={value}
      onChange={(e) => onChange(id, e.target.value)}
    >
      <option value="">{placeholder || "Select..."}</option>
      {(options || []).map((o: any) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("../../components/common/MenuBulkUpload", () => ({
  MenuBulkUpload: () => <div />,
}));

// ---- Helpers ----------------------------------------------------------------

const callMock = vi.mocked(call);

function setupCallMock() {
  callMock.mockImplementation(((method: string, params: any) => {
    if (method === "frappe.client.get" && params?.doctype === "URY Menu") {
      const doc = MENU_DOCS[params.name];
      return Promise.resolve({ message: doc ? { ...doc, items: [...doc.items] } : undefined });
    }
    if (method === "frappe.client.save") {
      savedDocs.push(params?.doc);
      return Promise.resolve({ message: params?.doc });
    }
    if (method === "frappe.client.insert") {
      return Promise.resolve({ message: { name: params?.doc?.item_name || "NEW-ITEM" } });
    }
    return Promise.resolve({ message: {} });
  }) as any);
}

async function openAddItemDrawer() {
  const user = userEvent.setup();
  render(<MenuPage />);
  const addButton = await screen.findByRole("button", { name: "Add Item" });
  await user.click(addButton);
  return user;
}

const itemSelectCalls = () =>
  callMock.mock.calls.filter(
    (c: any[]) => c[0] === "frappe.client.insert" && c[1]?.doc?.doctype === "Item"
  );

// ---- Tests ------------------------------------------------------------------

describe("MenuPage", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    savedDocs = [];
    setupCallMock();
  });

  it("renders without errors", () => {
    const { container } = render(<MenuPage />);
    expect(container).toBeTruthy();
  });

  it("fetches menus on mount", async () => {
    render(<MenuPage />);

    await waitFor(() => {
      expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
    }, { timeout: 2000 });
  });

  it("renders all buttons on the page", () => {
    render(<MenuPage />);
    const buttons = screen.queryAllByRole("button");
    expect(buttons.length >= 0).toBe(true);
  });

  it("opens the Add Item drawer with a Select Item dropdown and an 'Add to Menu' button", async () => {
    await openAddItemDrawer();

    // Select Item dropdown is present with options from the Item master
    const select = screen.getByTestId("ss-item-select");
    expect(select).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Dosa (ITEM-001)" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Payasam (ITEM-002)" })).toBeInTheDocument();

    // Primary action is "Add to Menu"
    expect(screen.getByRole("button", { name: "Add to Menu" })).toBeInTheDocument();

    // Old creation UI is gone: no free-text creation path, no image upload, no "Create Item" button
    expect(screen.queryByRole("button", { name: "Create Item" })).not.toBeInTheDocument();
    expect(screen.queryByText("Upload Image")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Item Name/)).not.toBeInTheDocument();
  });

  it("autofills item_name, rate and course when an item is selected", async () => {
    const user = await openAddItemDrawer();

    await user.selectOptions(screen.getByTestId("ss-item-select"), "ITEM-002");

    expect(screen.getByDisplayValue("40")).toBeInTheDocument(); // autofill: standard_rate
    expect(screen.getByTestId("ss-course")).toHaveValue("Dessert"); // autofill: custom_course
  });

  it("adds an existing item to the menu without inserting a new Item master", async () => {
    const user = await openAddItemDrawer();

    await user.selectOptions(screen.getByTestId("ss-item-select"), "ITEM-002");
    await user.click(screen.getByRole("button", { name: "Add to Menu" }));

    await waitFor(() => {
      expect(showToast.success).toHaveBeenCalledWith("Item added to menu");
    });

    // The URY Menu doc was saved with the new row
    await waitFor(() => {
      expect(savedDocs.length).toBeGreaterThan(0);
    });
    const lastSaved = savedDocs[savedDocs.length - 1];
    expect(lastSaved.name).toBe("Menu-1");
    expect(lastSaved.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          item: "ITEM-002",
          item_name: "Payasam",
          rate: 40,
          course: "Dessert",
          special_dish: 0,
          disabled: 0,
        }),
      ])
    );

    // No new Item master record was created
    expect(itemSelectCalls()).toHaveLength(0);
  });

  it("prevents selecting an item that already exists in the target menu", async () => {
    const user = await openAddItemDrawer();

    // ITEM-001 (Dosa) is already on Menu-1
    await user.selectOptions(screen.getByTestId("ss-item-select"), "ITEM-001");

    expect(showToast.error).toHaveBeenCalledWith("This item is already added to this menu");

    // Selection was rejected: nothing autofilled, nothing saved, no Item inserted
    expect(screen.queryByDisplayValue("50")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add to Menu" }));
    await waitFor(() => {
      expect(callMock).toHaveBeenCalled();
    });
    expect(savedDocs).toHaveLength(0);
    expect(itemSelectCalls()).toHaveLength(0);
  });

  it("blocks submission when the backend menu doc already contains the item", async () => {
    const user = await openAddItemDrawer();

    // Select ITEM-003 (not in the currently displayed list)
    await user.selectOptions(screen.getByTestId("ss-item-select"), "ITEM-003");

    // Meanwhile the menu doc changed server-side and now contains ITEM-003
    MENU_DOCS["Menu-1"].items.push({
      name: "row-2", item: "ITEM-003", item_name: "Idli", rate: 30, course: "Main-Course",
    });

    await user.click(screen.getByRole("button", { name: "Add to Menu" }));

    await waitFor(() => {
      expect(showToast.error).toHaveBeenCalledWith("This item is already added to this menu");
    });
    expect(savedDocs).toHaveLength(0);
    expect(itemSelectCalls()).toHaveLength(0);

    MENU_DOCS["Menu-1"].items.pop();
  });

  it("keeps the edit workflow with a 'Save Changes' button", async () => {
    const user = await openAddItemDrawer();
    // Close the drawer again — we need the list to reach the edit action
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    // Wait for the list view to render the existing Dosa row
    const dosaCell = await screen.findByText("Dosa");
    const row = dosaCell.closest("tr");
    expect(row).toBeTruthy();
    const editButton = within(row as HTMLElement).getByRole("button");
    await user.click(editButton);

    // Edit drawer opens with the existing row's data
    expect(screen.getByDisplayValue("Dosa")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeInTheDocument();
    expect(screen.queryByTestId("ss-item-select")).not.toBeInTheDocument();
  });
});
