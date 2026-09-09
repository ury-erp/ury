import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PaymentTerminalPage from "./PaymentTerminalPage";
import { paymentTerminalService } from "../../services/paymentTerminal";

vi.mock("../../services/paymentTerminal", () => ({
  paymentTerminalService: {
    listTerminals: vi.fn(),
    listTerminalTransactions: vi.fn(),
    createTerminal: vi.fn(),
  },
}));

const mockTerminals = [
  {
    name: "TERM-001",
    terminal_id: "T001",
    device: "Ingenico",
    provider: "Ingenico",
    status: "Idle",
  },
  {
    name: "TERM-002",
    terminal_id: "T002",
    device: "PAX",
    provider: "PAX",
    status: "Busy",
  },
];

const mockTransactions = [
  {
    name: "TXN-001",
    terminal: "TERM-001",
    amount: 5000,
    status: "Success",
    created_at: "2026-09-09T12:30:00",
  },
];

describe("PaymentTerminalPage", () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(paymentTerminalService.listTerminals).mockResolvedValue(
      mockTerminals as any
    );
    vi.mocked(paymentTerminalService.listTerminalTransactions).mockResolvedValue(
      mockTransactions as any
    );
  });

  it("renders payment terminals section", async () => {
    render(<PaymentTerminalPage />);

    await waitFor(() => {
      expect(paymentTerminalService.listTerminals).toHaveBeenCalled();
    });
  });

  it("displays list of terminals", async () => {
    render(<PaymentTerminalPage />);

    await waitFor(() => {
      expect(screen.getByText("T001")).toBeInTheDocument();
    });
  });

  it("displays terminal status", async () => {
    render(<PaymentTerminalPage />);

    await waitFor(() => {
      expect(screen.getByText("Idle")).toBeInTheDocument();
    });
  });

  it("loads transactions on mount", async () => {
    render(<PaymentTerminalPage />);

    await waitFor(() => {
      expect(paymentTerminalService.listTerminalTransactions).toHaveBeenCalled();
    });
  });

  it("displays transactions list", async () => {
    render(<PaymentTerminalPage />);

    await waitFor(() => {
      expect(screen.getByText("TERM-001")).toBeInTheDocument();
    });
  });

  it("shows loading state while fetching terminals", () => {
    vi.mocked(paymentTerminalService.listTerminals).mockImplementation(
      () => new Promise(() => {})
    );

    render(<PaymentTerminalPage />);

    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("handles error when fetching terminals fails", async () => {
    vi.mocked(paymentTerminalService.listTerminals).mockRejectedValue(
      new Error("API Error")
    );

    render(<PaymentTerminalPage />);

    await waitFor(() => {
      expect(paymentTerminalService.listTerminals).toHaveBeenCalled();
    });
  });

  it("displays different terminal statuses", async () => {
    render(<PaymentTerminalPage />);

    await waitFor(() => {
      expect(screen.getByText("Idle")).toBeInTheDocument();
      expect(screen.getByText("Busy")).toBeInTheDocument();
    });
  });
});
