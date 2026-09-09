import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ReportsLayout } from "./ReportsLayout";

const mockSetActiveReport = vi.fn();
vi.mock("../../components/chat/ActiveReportContext", () => ({
  useActiveReportContext: () => ({
    setActiveReport: mockSetActiveReport,
  }),
}));

vi.mock("./reportsRegistry", () => ({
  reportsRegistry: [
    { id: "sales", path: "sales", label: "Sales Report" },
    { id: "items", path: "items", label: "Items Report" },
  ],
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useLocation: () => ({ pathname: "/reports/sales" }),
    Outlet: () => <div>Outlet</div>,
  };
});

describe("ReportsLayout", () => {
  beforeEach(() => { cleanup(); mockSetActiveReport.mockReset(); });

  it("renders outlet", () => {
    const { container } = render(<ReportsLayout />);
    expect(container).toBeInTheDocument();
  });

  it("sets active report on mount", () => {
    render(<ReportsLayout />);
    expect(mockSetActiveReport).toHaveBeenCalled();
  });

  it("clears active report on unmount", () => {
    const { unmount } = render(<ReportsLayout />);
    unmount();
    expect(mockSetActiveReport).toHaveBeenCalledWith(null);
  });
});
