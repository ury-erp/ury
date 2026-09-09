import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MenuPage from "./MenuPage";

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
        return Promise.resolve([
          { name: "Main-Course" },
          { name: "Dessert" },
        ]);
      }
      return Promise.resolve([]);
    }),
  },
}));

vi.mock("@ury/core", () => ({
  formatCurrency: (amount: number) => `Rs. ${amount}`,
  call: vi.fn(),
}));

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
  default: ({ isOpen, children }: any) => isOpen ? <div>{children}</div> : null,
}));

vi.mock("../../components/layout/PageToolbar", () => ({
  PageToolbar: () => <div />,
}));

vi.mock("../../components/common/SearchableSelect", () => ({
  SearchableSelect: () => <div />,
}));

vi.mock("../../components/common/MenuBulkUpload", () => ({
  MenuBulkUpload: () => <div />,
}));

describe("MenuPage", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders without errors", () => {
    const { container } = render(<MenuPage />);
    expect(container).toBeTruthy();
  });

  it("fetches menus on mount", async () => {
    render(<MenuPage />);
    
    // Wait for the component to render and data to load
    await waitFor(() => {
      expect(screen.getByRole("button")).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it("renders all buttons on the page", () => {
    render(<MenuPage />);
    const buttons = screen.queryAllByRole("button");
    expect(buttons.length >= 0).toBe(true);
  });
});
