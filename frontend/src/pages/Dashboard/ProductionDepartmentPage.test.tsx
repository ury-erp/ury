import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProductionDepartmentPage from "./ProductionDepartmentPage";
import { dashboardService } from "../../services/dashboard";
import { call } from "@ury/core";

vi.mock("../../context/BranchContext", () => ({
  useBranchContext: () => ({
    activeBranchId: "Kozhikode",
  }),
}));

vi.mock("../../services/dashboard", () => ({
  dashboardService: {
    getModuleRecords: vi.fn(),
  },
}));

vi.mock("@ury/core", () => ({
  call: vi.fn(),
  showToast: {
    warning: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../components/common/SearchableSelect", () => ({
  SearchableSelect: () => <div />,
}));

vi.mock("../../components/layout/SideDrawer", () => ({
  default: ({ isOpen, children }: any) => {
    return isOpen ? <div data-testid="side-drawer">{children}</div> : null;
  },
}));

const mockDepartments = [
  {
    name: "Indian",
    department_name: "Indian",
    company: "URY",
    branch: "Kozhikode",
    department_manager: "manager@ury.test",
    department_warehouse: "Central Store",
    cost_center: "Production",
    issue_control_policy: "Plan Controlled",
    wastage_policy: "Allow",
    enabled: true,
  },
];

describe("ProductionDepartmentPage", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.mocked(dashboardService.getModuleRecords).mockImplementation(
      (doctype: string) => {
        if (doctype === "URY Production Department") {
          return Promise.resolve(mockDepartments);
        }
        if (
          doctype === "Company" ||
          doctype === "Branch" ||
          doctype === "User" ||
          doctype === "Warehouse" ||
          doctype === "Cost Center"
        ) {
          return Promise.resolve([{ name: "Default" }]);
        }
        return Promise.resolve([]);
      }
    );
    vi.mocked(call).mockResolvedValue({});
  });

  it("renders production department list", async () => {
    render(<ProductionDepartmentPage />);

    await waitFor(() => {
      expect(dashboardService.getModuleRecords).toHaveBeenCalled();
    });
  });

  it("loads departments for the active branch", async () => {
    render(<ProductionDepartmentPage />);

    await waitFor(() => {
      expect(dashboardService.getModuleRecords).toHaveBeenCalledWith(
        "URY Production Department",
        "Kozhikode"
      );
    });
  });

  it("loads lookup data", async () => {
    render(<ProductionDepartmentPage />);

    await waitFor(() => {
      expect(dashboardService.getModuleRecords).toHaveBeenCalledWith(
        "Company",
        "all"
      );
    });
  });

  it("displays departments in table", async () => {
    render(<ProductionDepartmentPage />);

    await waitFor(() => {
      expect(dashboardService.getModuleRecords).toHaveBeenCalled();
    });

    expect(screen.getByText(/Indian/i)).toBeInTheDocument();
  });

  it("opens add department drawer", async () => {
    const user = userEvent.setup();
    render(<ProductionDepartmentPage />);

    await waitFor(() => {
      expect(dashboardService.getModuleRecords).toHaveBeenCalled();
    });

    const addButton = screen.getAllByRole("button").find(
      (btn) => btn.textContent?.toLowerCase().includes("add")
    );
    expect(addButton).toBeDefined();
    
    if (addButton) {
      await user.click(addButton);
      
      // Wait for the drawer to open and check for input field
      await waitFor(() => {
        const inputs = screen.getAllByRole("textbox");
        expect(inputs.length).toBeGreaterThan(0);
      });
    }
  });

  it("handles loading state", () => {
    vi.mocked(dashboardService.getModuleRecords).mockImplementation(
      () => new Promise(() => {})
    );

    render(<ProductionDepartmentPage />);

    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("handles error when fetching fails", async () => {
    vi.mocked(dashboardService.getModuleRecords).mockRejectedValue(
      new Error("API Error")
    );

    render(<ProductionDepartmentPage />);

    await waitFor(() => {
      expect(dashboardService.getModuleRecords).toHaveBeenCalled();
    });
  });
});
