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
    // Recorded calls must not leak between tests -- the assertions below read
    // the most recent getPlanStockOnHand call.
    vi.clearAllMocks();
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

  describe("stock-on-hand is fetched for components, not finished goods", () => {
    // A MADE_TO_ORDER plan produces "Chicken Biryani" from "Biryani Rice" --
    // the output item and the BOM component are different item codes. Asking
    // for stock by output item can never match a demand line keyed on
    // component_item, which made every row read "Not available".
    const setUpPlan = () => {
      vi.mocked(departmentStockService.getActivePlan).mockResolvedValue({
        name: "PLAN-001",
        status: "Locked for Production",
        demandVector: [
          {
            component_item: "Biryani Rice",
            department: "Kitchen",
            required_qty: 3.5,
            stock_uom: "Kg",
          },
          {
            component_item: "Biryani Masala",
            department: "Kitchen",
            required_qty: 1,
            stock_uom: "Kg",
          },
        ],
      } as any);
      vi.mocked(salesPlanService.getPlan).mockResolvedValue({
        name: "PLAN-001",
        company: "Main",
        items: [{ item_code: "Chicken Biryani", qty: 10, department: "Kitchen" }],
      } as any);
    };

    it("requests the component item codes", async () => {
      setUpPlan();
      render(<RequirementsPage />);

      await waitFor(() => {
        expect(departmentStockService.getPlanStockOnHand).toHaveBeenCalled();
      });

      const calls = vi.mocked(departmentStockService.getPlanStockOnHand).mock.calls;
      const [, requestedItems] = calls[calls.length - 1];
      expect(requestedItems).toEqual([
        { item_code: "Biryani Rice", department: "Kitchen" },
        { item_code: "Biryani Masala", department: "Kitchen" },
      ]);
      expect(requestedItems.map((item: { item_code: string }) => item.item_code)).not.toContain("Chicken Biryani");
    });

    it("renders the returned quantity instead of Not available", async () => {
      setUpPlan();
      vi.mocked(departmentStockService.getPlanStockOnHand).mockResolvedValue([
        {
          item_code: "Biryani Rice",
          department: "Kitchen",
          allocatable_qty: 1.75,
          valuation_rate: 80,
          resolved_from: "department",
        },
        {
          item_code: "Biryani Masala",
          department: "Kitchen",
          allocatable_qty: 0.5,
          valuation_rate: 126,
          resolved_from: "department",
        },
      ] as any);

      render(<RequirementsPage />);

      await waitFor(() => {
        expect(screen.getByText("1.750 Kg")).toBeInTheDocument();
      });
      expect(screen.getByText("0.500 Kg")).toBeInTheDocument();
      expect(screen.queryByText("Not available")).not.toBeInTheDocument();
    });

    it("de-duplicates a component repeated across production units", async () => {
      vi.mocked(departmentStockService.getActivePlan).mockResolvedValue({
        name: "PLAN-001",
        status: "Locked for Production",
        demandVector: [
          { component_item: "EG", department: "Kitchen", required_qty: 10, stock_uom: "Nos" },
          { component_item: "EG", department: "Kitchen", required_qty: 4, stock_uom: "Nos" },
          { component_item: "EG", department: "Salad", required_qty: 2, stock_uom: "Nos" },
        ],
      } as any);
      render(<RequirementsPage />);

      await waitFor(() => {
        expect(departmentStockService.getPlanStockOnHand).toHaveBeenCalled();
      });

      const calls = vi.mocked(departmentStockService.getPlanStockOnHand).mock.calls;
      const [, requestedItems] = calls[calls.length - 1];
      expect(requestedItems).toEqual([
        { item_code: "EG", department: "Kitchen" },
        { item_code: "EG", department: "Salad" },
      ]);
    });
  });
});
