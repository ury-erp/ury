import { render } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { getProductionUnitsForBranchMock, useKotErrorChannelsMock, showToastMock } = vi.hoisted(() => ({
  getProductionUnitsForBranchMock: vi.fn(),
  useKotErrorChannelsMock: vi.fn(),
  showToastMock: { error: vi.fn() },
}));

vi.mock("../lib/production-api", () => ({
  getProductionUnitsForBranch: (...args) => getProductionUnitsForBranchMock(...args),
}));

vi.mock("../lib/realtime", () => ({
  useKotErrorChannels: (...args) => useKotErrorChannelsMock(...args),
}));

vi.mock("@ury/ui", () => ({ showToast: showToastMock }));

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => ({ posProfile: { branch: "Kozhikode" } }),
}));

import KotAlertListener from "./KotAlertListener";

describe("KotAlertListener", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is a headless component", () => {
    getProductionUnitsForBranchMock.mockResolvedValueOnce(["unit-1"]);
    const { container } = render(<KotAlertListener />);
    expect(container.firstChild).toBeNull();
  });

  it("loads production units on mount", async () => {
    getProductionUnitsForBranchMock.mockResolvedValueOnce(["unit-1", "unit-2"]);
    render(<KotAlertListener />);
    await new Promise(r => setTimeout(r, 100));
    expect(getProductionUnitsForBranchMock).toHaveBeenCalledTimes(1);
  });

  it("calls useKotErrorChannels hook", async () => {
    getProductionUnitsForBranchMock.mockResolvedValueOnce(["unit-1"]);
    render(<KotAlertListener />);
    await new Promise(r => setTimeout(r, 100));
    expect(useKotErrorChannelsMock).toHaveBeenCalled();
  });

  it("shows error toast when error occurs", async () => {
    getProductionUnitsForBranchMock.mockResolvedValueOnce(["unit-1"]);
    render(<KotAlertListener />);
    await new Promise(r => setTimeout(r, 100));
    const handler = useKotErrorChannelsMock.mock.calls[0]?.[2];
    handler?.({ message: "Test error" });
    expect(showToastMock.error).toHaveBeenCalledWith("Test error");
  });

  it("handles empty production units", async () => {
    getProductionUnitsForBranchMock.mockResolvedValueOnce([]);
    render(<KotAlertListener />);
    await new Promise(r => setTimeout(r, 100));
    expect(useKotErrorChannelsMock).toHaveBeenCalledWith("Kozhikode", [], expect.any(Function));
  });

  it("handles API errors", async () => {
    getProductionUnitsForBranchMock.mockRejectedValueOnce(new Error("API failed"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<KotAlertListener />);
    await new Promise(r => setTimeout(r, 100));
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
