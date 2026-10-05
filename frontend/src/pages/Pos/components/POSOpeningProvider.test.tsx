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

const { mockPosProfile } = vi.hoisted(() => ({
  // Stable identity: a fresh object per render would re-trigger the
  // provider's posProfile effect on every state change and re-run
  // checkPOSStatus mid-assertion.
  mockPosProfile: { name: "POS-001", custom_daily_pos_close: 0 },
}));

vi.mock("../store/pos-store", () => ({
  usePOSStore: vi.fn(() => ({
    posProfile: mockPosProfile,
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
    // check_opening_entry returns the list of open entries; a non-empty list
    // means "opened".
    (posOpeningApi.checkPOSOpening as any).mockResolvedValue({
      message: [{ name: "OPEN-001", company: "Test", pos_profile: "POS-001", period_start_date: "2024-01-01" }],
    });
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
    (checklistApi.getChecklist as any).mockResolvedValue({ logStatus: "Complete" });

    render(
      <POSOpeningProvider>
        <div>Test Content</div>
      </POSOpeningProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Opening Entry Dialog")).toBeInTheDocument();
    });
  });

  it("shows opening entry dialog when check_opening_entry returns an empty list (ERPNext v16)", async () => {
    // v16's check_opening_entry returns [] where older versions returned 1;
    // without this arm a never-opened POS fell through to the "opened"
    // branch and rendered children with no POS Opening Entry behind them.
    (posOpeningApi.checkPOSOpening as any).mockResolvedValue({ message: [] });
    (checklistApi.getChecklist as any).mockResolvedValue({ logStatus: "Complete" });

    render(
      <POSOpeningProvider>
        <div>Test Content</div>
      </POSOpeningProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Opening Entry Dialog")).toBeInTheDocument();
    });
    expect(screen.queryByText("Test Content")).not.toBeInTheDocument();
  });

  it("gates the opening entry dialog on a pending Opening checklist (POS not opened)", async () => {
    (posOpeningApi.checkPOSOpening as any).mockResolvedValue({ message: 1 });
    // First poll: checklist pending (role-based Dependent Checklist goal
    // without a Quality Review). After completion: Complete.
    (checklistApi.getChecklist as any)
      .mockResolvedValueOnce({ logStatus: null })
      .mockResolvedValue({ logStatus: "Complete" });

    render(
      <POSOpeningProvider>
        <div>Test Content</div>
      </POSOpeningProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Checklist Dialog")).toBeInTheDocument();
    });
    expect(screen.queryByText("Opening Entry Dialog")).not.toBeInTheDocument();

    // Completing the checklist re-runs the status check and lands on the
    // opening entry dialog.
    await userEvent.click(screen.getByText("Checklist Dialog"));
    await waitFor(() => {
      expect(screen.getByText("Opening Entry Dialog")).toBeInTheDocument();
    });
  });

  it("gates on a pending Opening checklist when check_opening_entry returns [] (ERPNext v16)", async () => {
    (posOpeningApi.checkPOSOpening as any).mockResolvedValue({ message: [] });
    (checklistApi.getChecklist as any)
      .mockResolvedValueOnce({ logStatus: null })
      .mockResolvedValue({ logStatus: "Complete" });

    render(
      <POSOpeningProvider>
        <div>Test Content</div>
      </POSOpeningProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Checklist Dialog")).toBeInTheDocument();
    });
    expect(screen.queryByText("Opening Entry Dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Checklist Dialog"));
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
    (posOpeningApi.checkPOSOpening as any).mockResolvedValue({
      message: [{ name: "OPEN-001", company: "Test", pos_profile: "POS-001", period_start_date: "2024-01-01" }],
    });
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
    (posOpeningApi.checkPOSOpening as any).mockResolvedValue({
      message: [{ name: "OPEN-001", company: "Test", pos_profile: "POS-001", period_start_date: "2024-01-01" }],
    });
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
