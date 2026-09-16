import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import KotAlertListener from "./KotAlertListener";

const mockGetProductionUnitsForBranch = vi.fn();
const mockUseKotErrorChannels = vi.fn();

vi.mock("../lib/production-api", () => ({
  getProductionUnitsForBranch: (...args: any[]) =>
    mockGetProductionUnitsForBranch(...args),
}));

vi.mock("../lib/realtime", () => ({
  useKotErrorChannels: (...args: any[]) => mockUseKotErrorChannels(...args),
}));

vi.mock("@ury/ui", () => ({
  showToast: { error: vi.fn() },
}));

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => ({
    posProfile: { branch: "Kozhikode" },
  }),
}));

describe("KotAlertListener", () => {
  let mockShowToastError: any;

  beforeEach(async () => {
    mockGetProductionUnitsForBranch.mockClear();
    mockUseKotErrorChannels.mockClear();
    
    const uryUi = await import("@ury/ui");
    mockShowToastError = uryUi.showToast.error as any;
    if (mockShowToastError) {
      mockShowToastError.mockClear();
    }
  });

  it("renders without crashing", () => {
    mockGetProductionUnitsForBranch.mockResolvedValueOnce(["UNIT-1"]);

    const { container } = render(<KotAlertListener />);
    expect(container).toBeInTheDocument();
  });

  it("returns null (headless component)", () => {
    mockGetProductionUnitsForBranch.mockResolvedValueOnce(["UNIT-1"]);

    const { container } = render(<KotAlertListener />);
    expect(container.firstChild).toBeNull();
  });

  it("loads production units on mount", async () => {
    mockGetProductionUnitsForBranch.mockResolvedValueOnce(["UNIT-1", "UNIT-2"]);

    render(<KotAlertListener />);

    await waitFor(() => {
      expect(mockGetProductionUnitsForBranch).toHaveBeenCalled();
    });
  });

  it("subscribes to KOT error channels with production units", async () => {
    mockGetProductionUnitsForBranch.mockResolvedValueOnce(["UNIT-1", "UNIT-2"]);

    render(<KotAlertListener />);

    await waitFor(() => {
      expect(mockUseKotErrorChannels).toHaveBeenCalledWith(
        "Kozhikode",
        ["UNIT-1", "UNIT-2"],
        expect.any(Function)
      );
    });
  });

  it("handles empty production units list", async () => {
    mockGetProductionUnitsForBranch.mockResolvedValueOnce([]);

    render(<KotAlertListener />);

    await waitFor(() => {
      expect(mockGetProductionUnitsForBranch).toHaveBeenCalled();
      expect(mockUseKotErrorChannels).toHaveBeenCalledWith(
        "Kozhikode",
        [],
        expect.any(Function)
      );
    });
  });

  it("handles error when fetching production units", async () => {
    const error = new Error("Failed to load units");
    mockGetProductionUnitsForBranch.mockRejectedValueOnce(error);

    render(<KotAlertListener />);

    await waitFor(() => {
      expect(mockGetProductionUnitsForBranch).toHaveBeenCalled();
    });
  });

  it("handles KOT error payload with message", async () => {
    mockGetProductionUnitsForBranch.mockResolvedValueOnce(["UNIT-1"]);

    render(<KotAlertListener />);

    await waitFor(() => {
      const errorHandler = mockUseKotErrorChannels.mock.calls[0][2];
      expect(errorHandler).toBeDefined();
    });

    const errorHandler = mockUseKotErrorChannels.mock.calls[0][2];
    errorHandler({ message: "KOT validation failed" });

    expect(mockShowToastError).toHaveBeenCalledWith("KOT validation failed");
  });

  it("shows unknown error message when payload has no message", async () => {
    mockGetProductionUnitsForBranch.mockResolvedValueOnce(["UNIT-1"]);

    render(<KotAlertListener />);

    await waitFor(() => {
      const errorHandler = mockUseKotErrorChannels.mock.calls[0][2];
      expect(errorHandler).toBeDefined();
    });

    const errorHandler = mockUseKotErrorChannels.mock.calls[0][2];
    errorHandler({});

    expect(mockShowToastError).toHaveBeenCalled();
  });
});
