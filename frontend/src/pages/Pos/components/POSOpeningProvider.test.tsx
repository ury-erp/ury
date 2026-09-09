import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

vi.mock("../../../lib/pos/pos-opening-api", () => ({
  checkPOSOpening: vi.fn(),
  validatePOSClose: vi.fn(),
}));

vi.mock("../../../lib/pos/checklist-api", () => ({
  getChecklist: vi.fn(),
}));

vi.mock("../store/pos-store", () => ({
  usePOSStore: vi.fn(() => ({
    posProfile: { name: "POS-001", custom_daily_pos_close: 0 },
  })),
}));

vi.mock("./POSOpeningDialog", () => ({
  default: ({ onReload, type }: any) => <div onClick={onReload}>Opening Dialog {type}</div>,
}));

vi.mock("./POSOpeningEntryDialog", () => ({
  default: ({ onOpeningSubmitted }: any) => <div onClick={onOpeningSubmitted}>Opening Entry Dialog</div>,
}));

vi.mock("./POSClosingDialog", () => ({
  default: ({ onOpenChange, onClosingSubmitted }: any) => (
    <div onClick={() => onOpenChange(false)}>Closing Dialog</div>
  ),
}));

vi.mock("./ChecklistGateDialog", () => ({
  default: ({ onComplete }: any) => <div onClick={onComplete}>Checklist Dialog</div>,
}));

import POSOpeningProvider from "./POSOpeningProvider";
import * as posOpeningApi from "../../../lib/pos/pos-opening-api";
import * as checklistApi from "../../../lib/pos/checklist-api";

describe("POSOpeningProvider", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders children when POS is opened and validated", async () => {
    (posOpeningApi.checkPOSOpening as any).mockResolvedValue({ message: 0 });
    (checklistApi.getChecklist as any).mockResolvedValue({ logStatus: "Complete" });

    render(
      <POSOpeningProvider>
        <div>Test Content</div>
      </POSOpeningProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Test Content")).toBeInTheDocument();
    });
  });

  it("shows opening entry dialog when POS is not opened", async () => {
    (posOpeningApi.checkPOSOpening as any).mockResolvedValue({ message: 1 });

    render(
      <POSOpeningProvider>
        <div>Test Content</div>
      </POSOpeningProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Opening Entry Dialog")).toBeInTheDocument();
    });
  });

  it("shows loading state while checking POS status", () => {
    (posOpeningApi.checkPOSOpening as any).mockImplementation(() => new Promise(() => {}));

    render(
      <POSOpeningProvider>
        <div>Test Content</div>
      </POSOpeningProvider>
    );

    expect(screen.getByText("common.checking_pos_status")).toBeInTheDocument();
  });

  it("shows checklist gate dialog when checklist is incomplete", async () => {
    (posOpeningApi.checkPOSOpening as any).mockResolvedValue({ message: 0 });
    (checklistApi.getChecklist as any).mockResolvedValue({ logStatus: "Draft" });

    render(
      <POSOpeningProvider>
        <div>Test Content</div>
      </POSOpeningProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Checklist Dialog")).toBeInTheDocument();
    });
  });

  it("validates POS close when custom_daily_pos_close is enabled", async () => {
    (posOpeningApi.checkPOSOpening as any).mockResolvedValue({ message: 0 });
    (checklistApi.getChecklist as any).mockResolvedValue({ logStatus: "Complete" });
    
    // Mock usePOSStore to return custom_daily_pos_close: 1
    const { usePOSStore } = await import("../store/pos-store");
    (usePOSStore as any).mockReturnValueOnce({
      posProfile: { name: "POS-001", custom_daily_pos_close: 1 },
    });
    
    (posOpeningApi.validatePOSClose as any).mockResolvedValue({ message: "Success" });

    render(
      <POSOpeningProvider>
        <div>Test Content</div>
      </POSOpeningProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Test Content")).toBeInTheDocument();
    });
  });

  it("handles API errors gracefully", async () => {
    (posOpeningApi.checkPOSOpening as any).mockRejectedValue(new Error("API Error"));

    render(
      <POSOpeningProvider>
        <div>Test Content</div>
      </POSOpeningProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Opening Entry Dialog")).toBeInTheDocument();
    });
  });

  it("shows loading state when posProfile exists", () => {
    (posOpeningApi.checkPOSOpening as any).mockImplementation(() => new Promise(() => {}));

    render(
      <POSOpeningProvider>
        <div>Test Content</div>
      </POSOpeningProvider>
    );

    expect(screen.getByText("common.checking_pos_status")).toBeInTheDocument();
  });
});
