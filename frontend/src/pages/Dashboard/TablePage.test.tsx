import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import TablePage from "./TablePage";
import { dashboardService } from "../../services/dashboard";

vi.mock("../../context/BranchContext", () => ({
  useBranchContext: () => ({
    activeBranchId: "Kozhikode",
  }),
}));

vi.mock("../../services/dashboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/dashboard")>();
  return {
    ...actual,
    dashboardService: {
      getModuleRecords: vi.fn(),
    },
  };
});

vi.mock("@ury/core", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
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

const tables = [
  {
    name: "TABLE-001",
    table_name: "Table 1",
    no_of_seats: 4,
    branch: "Kozhikode",
    restaurant_room: "Main Hall",
    table_shape: "Square",
    is_take_away: false,
  },
];

describe("TablePage", () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(dashboardService.getModuleRecords).mockReset();
  });

  it("renders page and displays buttons", async () => {
    vi.mocked(dashboardService.getModuleRecords).mockResolvedValue([]);

    render(<TablePage />);
    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  it("renders a list of tables", async () => {
    vi.mocked(dashboardService.getModuleRecords).mockImplementation(async (doctype) => {
      if (doctype === "URY Table") {
        return tables;
      }
      return [];
    });

    render(<TablePage />);
    await waitFor(() => {
      expect(screen.getByText("Table 1")).toBeInTheDocument();
    });
  });

  it("displays table room information", async () => {
    vi.mocked(dashboardService.getModuleRecords).mockImplementation(async (doctype) => {
      if (doctype === "URY Table") {
        return tables;
      }
      return [];
    });

    render(<TablePage />);
    await waitFor(() => {
      expect(screen.getByText("Main Hall")).toBeInTheDocument();
    });
  });
});
