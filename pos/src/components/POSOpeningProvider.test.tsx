import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import POSOpeningProvider from "./POSOpeningProvider";

const { mockCheckPOSOpening, mockValidatePOSClose, mockGetChecklist, mockPosProfile } = vi.hoisted(() => ({
  mockCheckPOSOpening: vi.fn(),
  mockValidatePOSClose: vi.fn(),
  mockGetChecklist: vi.fn(),
  // Stable identity: a fresh object per render would re-trigger the
  // provider's posProfile effect on every state change and re-run
  // checkPOSStatus mid-assertion.
  mockPosProfile: { name: "POS-001", company: "Test", custom_daily_pos_close: 0 },
}));

vi.mock("../lib/pos-opening-api", () => ({
  checkPOSOpening: mockCheckPOSOpening,
  validatePOSClose: mockValidatePOSClose,
  parseFrappeError: (error: any) => {
    if (error?.httpStatus === 403) return "Permission denied";
    return null;
  },
  POSOpeningEntryRef: {},
}));

vi.mock("../lib/checklist-api", () => ({
  getChecklist: mockGetChecklist,
}));

vi.mock("./POSOpeningDialog", () => ({
  default: ({ state }: any) => <div data-testid="opening-dialog">{state}</div>,
}));

vi.mock("./POSOpeningScreen", () => ({
  default: ({ onSuccess }: any) => (
    <div data-testid="opening-screen">
      <button onClick={() => onSuccess()}>Open</button>
    </div>
  ),
}));

vi.mock("./ChecklistGateDialog", () => ({
  default: ({ onComplete }: any) => (
    <div data-testid="checklist-dialog">
      <button onClick={() => onComplete()}>Complete</button>
    </div>
  ),
}));

vi.mock("./POSClosingDialog", () => ({
  default: () => <div data-testid="closing-dialog">Closing</div>,
}));

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => ({
    posProfile: mockPosProfile,
    showVoluntaryClosing: false,
    setShowVoluntaryClosing: vi.fn(),
  }),
}));

vi.mock("../store/root-store", () => ({
  useRootStore: () => ({
    user: { name: "user1", roles: ["System Manager"] },
  }),
}));

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

describe("POSOpeningProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetChecklist.mockResolvedValue({ logStatus: "Complete" });
  });

  it("renders loading state initially", () => {
    mockCheckPOSOpening.mockImplementation(() => new Promise(() => {}));

    render(
      <POSOpeningProvider>
        <div>Test Content</div>
      </POSOpeningProvider>
    );

    expect(screen.getByText(/common.checking_pos_status/i)).toBeInTheDocument();
  });

  it("renders children when no blocking state", async () => {
    mockCheckPOSOpening.mockResolvedValueOnce({
      message: [{ name: "OPEN-001", company: "Test", pos_profile: "POS-001", period_start_date: "2024-01-01" }],
    });
    mockValidatePOSClose.mockResolvedValueOnce({ message: "Success" });

    render(
      <POSOpeningProvider>
        <div>Test Content</div>
      </POSOpeningProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Test Content")).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it("shows opening screen when no existing entry", async () => {
    mockCheckPOSOpening.mockResolvedValueOnce({ message: 1 });
    mockValidatePOSClose.mockResolvedValueOnce({ message: "Success" });

    render(
      <POSOpeningProvider>
        <div>Test Content</div>
      </POSOpeningProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("opening-screen")).toBeInTheDocument();
    });
  });

  it("shows opening screen when check_opening_entry returns an empty list (ERPNext v16)", async () => {
    // v16's check_opening_entry returns [] where older versions returned 1;
    // both must land on the opening screen, not on a bare content render.
    mockCheckPOSOpening.mockResolvedValueOnce({ message: [] });
    mockValidatePOSClose.mockResolvedValueOnce({ message: "Success" });

    render(
      <POSOpeningProvider>
        <div>Test Content</div>
      </POSOpeningProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("opening-screen")).toBeInTheDocument();
    });
    expect(screen.queryByText("Test Content")).not.toBeInTheDocument();
  });

  it("gates the opening screen on a pending Opening checklist when check_opening_entry returns [] (ERPNext v16)", async () => {
    mockCheckPOSOpening.mockResolvedValue({ message: [] });
    mockValidatePOSClose.mockResolvedValue({ message: "Success" });
    mockGetChecklist
      .mockResolvedValueOnce({ logStatus: null })
      .mockResolvedValue({ logStatus: "Complete" });

    render(
      <POSOpeningProvider>
        <div>Test Content</div>
      </POSOpeningProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("checklist-dialog")).toBeInTheDocument();
    });

    fireEvent.click(await screen.findByRole("button", { name: "Complete" }));
    await waitFor(() => {
      expect(screen.getByTestId("opening-screen")).toBeInTheDocument();
    });
  });

  it("gates the opening screen on a pending Opening checklist (no entry yet)", async () => {
    mockCheckPOSOpening.mockResolvedValue({ message: 1 });
    mockValidatePOSClose.mockResolvedValue({ message: "Success" });
    // First poll: checklist pending (role-based Dependent Checklist goal
    // without a Quality Review). After completion: Complete.
    mockGetChecklist
      .mockResolvedValueOnce({ logStatus: null })
      .mockResolvedValue({ logStatus: "Complete" });

    render(
      <POSOpeningProvider>
        <div>Test Content</div>
      </POSOpeningProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("checklist-dialog")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("opening-screen")).not.toBeInTheDocument();

    // Completing the checklist re-runs the status check and lands on the
    // opening screen.
    fireEvent.click(await screen.findByRole("button", { name: "Complete" }));
    await waitFor(() => {
      expect(screen.getByTestId("opening-screen")).toBeInTheDocument();
    });
  });

  it("shows dialog when permission denied", async () => {
    mockCheckPOSOpening.mockRejectedValueOnce({ httpStatus: 403 });

    render(
      <POSOpeningProvider>
        <div>Test Content</div>
      </POSOpeningProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("opening-dialog")).toBeInTheDocument();
    });
  });

  it("handles cross-company open error", async () => {
    mockCheckPOSOpening.mockResolvedValueOnce({
      message: [{ name: "OPEN-001", company: "Other", pos_profile: "POS-001", period_start_date: "2024-01-01" }],
    });

    render(
      <POSOpeningProvider>
        <div>Test Content</div>
      </POSOpeningProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("opening-dialog")).toBeInTheDocument();
    });
  });
});
