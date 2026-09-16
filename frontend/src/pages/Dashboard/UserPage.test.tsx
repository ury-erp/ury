import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import UserPage from "./UserPage";
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

const users = [
  {
    name: "user@ury.test",
    email: "user@ury.test",
    first_name: "Test",
    last_name: "User",
    full_name: "Test User",
    enabled: 1,
    roles: [],
  },
];

describe("UserPage", () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(dashboardService.getModuleRecords).mockReset();
  });

  it("shows page with buttons", async () => {
    vi.mocked(dashboardService.getModuleRecords).mockResolvedValue([]);

    render(<UserPage />);
    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  it("displays user email", async () => {
    vi.mocked(dashboardService.getModuleRecords).mockResolvedValue(users);

    render(<UserPage />);
    await waitFor(() => {
      expect(screen.getByText("user@ury.test")).toBeInTheDocument();
    });
  });

  it("renders page structure", async () => {
    vi.mocked(dashboardService.getModuleRecords).mockResolvedValue([]);

    render(<UserPage />);
    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
    });
  });
});
