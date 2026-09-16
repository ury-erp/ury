import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import RoomPage from "./RoomPage";
import { dashboardService } from "../../services/dashboard";

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

const mockRooms = [
  {
    name: "Main Hall",
    room_type: "AC",
    branch: "Kozhikode",
    kot_printing: 1,
  },
];

describe("RoomPage", () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(dashboardService.getModuleRecords).mockReset();
  });

  it("renders page with buttons", async () => {
    vi.mocked(dashboardService.getModuleRecords).mockResolvedValue([]);

    render(<RoomPage />);
    await waitFor(() => {
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  it("renders a list of rooms", async () => {
    vi.mocked(dashboardService.getModuleRecords).mockImplementation(async (doctype) => {
      if (doctype === "URY Room") {
        return mockRooms;
      }
      return [];
    });

    render(<RoomPage />);
    await waitFor(() => {
      expect(screen.getByText("Main Hall")).toBeInTheDocument();
    });
  });

  it("displays room branch information", async () => {
    vi.mocked(dashboardService.getModuleRecords).mockImplementation(async (doctype) => {
      if (doctype === "URY Room") {
        return mockRooms;
      }
      return [];
    });

    render(<RoomPage />);
    await waitFor(() => {
      expect(screen.getByText("Kozhikode")).toBeInTheDocument();
    });
  });
});
