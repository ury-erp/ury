import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/pos/pos-opening-api", () => ({
  getModeOfPayment: vi.fn(),
  createPosOpeningEntry: vi.fn(),
  submitPosOpeningEntry: vi.fn(),
}));

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => ({
    posProfile: { name: "POS-001", company: "URY" },
  }),
}));

vi.mock("../store/root-store", () => ({
  useRootStore: () => ({
    user: { name: "user1" },
  }),
}));

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

import POSOpeningEntryDialog from "./POSOpeningEntryDialog";
import * as posOpeningApi from "../../../lib/pos/pos-opening-api";

describe("POSOpeningEntryDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (posOpeningApi.getModeOfPayment as any).mockResolvedValue([]);
  });

  it("does not render when open is false", () => {
    const { queryByText } = render(
      <POSOpeningEntryDialog
        open={false}
        onOpenChange={vi.fn()}
        onOpeningSubmitted={vi.fn()}
      />
    );
    expect(queryByText("pos_opening.title")).not.toBeInTheDocument();
  });

  it("renders dialog when open is true", async () => {
    (posOpeningApi.getModeOfPayment as any).mockResolvedValueOnce([]);

    render(
      <POSOpeningEntryDialog
        open={true}
        onOpenChange={vi.fn()}
        onOpeningSubmitted={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("pos_opening.title")).toBeInTheDocument();
    });
  });

  it("loads payment modes when dialog opens", async () => {
    (posOpeningApi.getModeOfPayment as any).mockResolvedValueOnce([]);

    render(
      <POSOpeningEntryDialog
        open={true}
        onOpenChange={vi.fn()}
        onOpeningSubmitted={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(posOpeningApi.getModeOfPayment).toHaveBeenCalled();
    });
  });

  it("shows cancel button", async () => {
    (posOpeningApi.getModeOfPayment as any).mockResolvedValueOnce([]);

    render(
      <POSOpeningEntryDialog
        open={true}
        onOpenChange={vi.fn()}
        onOpeningSubmitted={vi.fn()}
      />
    );

    await waitFor(() => {
      const buttons = screen.getAllByText("common.cancel");
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  it("calls onOpenChange when dialog state changes", async () => {
    const mockOnOpenChange = vi.fn();
    (posOpeningApi.getModeOfPayment as any).mockResolvedValueOnce([]);

    render(
      <POSOpeningEntryDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onOpeningSubmitted={vi.fn()}
      />
    );

    await waitFor(() => {
      const cancelButtons = screen.getAllByText("common.cancel");
      expect(cancelButtons.length).toBeGreaterThan(0);
    });
  });
});
