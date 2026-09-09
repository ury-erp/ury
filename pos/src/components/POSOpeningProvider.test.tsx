import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import POSOpeningProvider from "./POSOpeningProvider";

const { mockCheckPOSOpening, mockValidatePOSClose } = vi.hoisted(() => ({
  mockCheckPOSOpening: vi.fn(),
  mockValidatePOSClose: vi.fn(),
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
  getChecklist: vi.fn().mockResolvedValue({ logStatus: "Complete" }),
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
    posProfile: { name: "POS-001", company: "Test", custom_daily_pos_close: 0 },
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
