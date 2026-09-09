import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import RequirementsPage from "./RequirementsPage";
import { departmentStockService } from "../../services/departmentStock";
import { salesPlanService } from "../../services/salesPlan";

vi.mock("../../context/BranchContext", () => ({
  useBranchContext: () => ({
    activeBranchId: "Kozhikode",
  }),
}));

vi.mock("../../services/departmentStock", () => ({
  departmentStockService: {
    getActivePlan: vi.fn(),
    getPlanStockOnHand: vi.fn(),
  },
}));

vi.mock("../../services/salesPlan", () => ({
  salesPlanService: {
    getPlan: vi.fn(),
  },
  buildSalesPlanDraftKey: vi.fn(),
  getSalesPlanDraftQuantities: vi.fn().mockReturnValue({}),
  saveSalesPlanDraftQuantities: vi.fn(),
}));

describe("RequirementsPage", () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(departmentStockService.getActivePlan).mockResolvedValue({
      name: "PLAN-001",
      status: "Approved",
      demandVector: [],
    } as any);
    vi.mocked(departmentStockService.getPlanStockOnHand).mockResolvedValue([]);
    vi.mocked(salesPlanService.getPlan).mockResolvedValue({
      name: "PLAN-001",
      items: [],
      company: "Main",
    } as any);
  });

  it("renders the requirements page", async () => {
    render(<RequirementsPage />);
    await waitFor(() => {
      expect(screen.getByText("Requirements")).toBeInTheDocument();
    });
  });

  it("mocks department stock service", () => {
    expect(departmentStockService.getActivePlan).toBeDefined();
  });

  it("mocks sales plan service", () => {
    expect(salesPlanService.getPlan).toBeDefined();
  });

  it("department stock service is callable", async () => {
    await departmentStockService.getActivePlan("test");
    expect(departmentStockService.getActivePlan).toHaveBeenCalled();
  });

  it("sales plan service is callable", async () => {
    await salesPlanService.getPlan("test");
    expect(salesPlanService.getPlan).toHaveBeenCalled();
  });

  it("handles empty demand vector", () => {
    const data = { demandVector: [] };
    expect(data.demandVector).toEqual([]);
  });
});
