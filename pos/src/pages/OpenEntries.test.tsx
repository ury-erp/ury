import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import OpenEntries from "./OpenEntries";

// Mock the API
const getOpenPosOpeningEntriesMock = vi.fn();
vi.mock("../lib/pos-closing-api", () => ({
  getOpenPosOpeningEntries: (...args: any[]) => getOpenPosOpeningEntriesMock(...args),
}));

// Mock the store
const mockPosStore = {
  posProfile: { name: "POS-001", branch: "Kozhikode" },
};
vi.mock("../store/pos-store", () => ({
  usePOSStore: () => mockPosStore,
}));

// Mock i18n
vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

// Mock UI components
vi.mock("@ury/ui", () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: any) => <div data-testid="card-content">{children}</div>,
  Spinner: ({ size }: any) => <div data-testid="spinner">{size}</div>,
}));

describe("OpenEntries", () => {
  beforeEach(() => {
    getOpenPosOpeningEntriesMock.mockReset();
  });

  it("renders the page title", async () => {
    getOpenPosOpeningEntriesMock.mockResolvedValueOnce([]);

    render(<OpenEntries />);

    await waitFor(() => {
      expect(screen.getByText("Open Sessions")).toBeInTheDocument();
    });
  });

  it("shows loading spinner while fetching data", () => {
    getOpenPosOpeningEntriesMock.mockImplementationOnce(
      () => new Promise(() => {}) // Never resolves
    );

    render(<OpenEntries />);

    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });

  it("shows error message when API fails", async () => {
    getOpenPosOpeningEntriesMock.mockRejectedValueOnce(
      new Error("API Error")
    );

    render(<OpenEntries />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load open sessions")).toBeInTheDocument();
    });
  });

  it("shows empty state when no entries are returned", async () => {
    getOpenPosOpeningEntriesMock.mockResolvedValueOnce([]);

    render(<OpenEntries />);

    await waitFor(() => {
      expect(screen.getByText("No open POS sessions")).toBeInTheDocument();
    });
  });

  it("displays a table with entries when data is available", async () => {
    const mockEntries = [
      {
        name: "entry-1",
        user: "user1@example.com",
        period_start_date: "2024-01-15T10:30:00",
        pos_profile: "POS-001",
      },
      {
        name: "entry-2",
        user: "user2@example.com",
        period_start_date: "2024-01-15T14:45:00",
        pos_profile: "POS-002",
      },
    ];

    getOpenPosOpeningEntriesMock.mockResolvedValueOnce(mockEntries);

    render(<OpenEntries />);

    await waitFor(() => {
      expect(screen.getByText("user1@example.com")).toBeInTheDocument();
      expect(screen.getByText("user2@example.com")).toBeInTheDocument();
      expect(screen.getByText("POS-001")).toBeInTheDocument();
      expect(screen.getByText("POS-002")).toBeInTheDocument();
    });
  });

  it("formats dates correctly in the table", async () => {
    const mockEntries = [
      {
        name: "entry-1",
        user: "testuser",
        period_start_date: "2024-01-15T10:30:00",
        pos_profile: "POS-001",
      },
    ];

    getOpenPosOpeningEntriesMock.mockResolvedValueOnce(mockEntries);

    render(<OpenEntries />);

    await waitFor(() => {
      // The date should be formatted as "Jan 15, 2024, 10:30 AM"
      const dateText = screen.getByText(/Jan 15, 2024/);
      expect(dateText).toBeInTheDocument();
    });
  });

  it("handles no posProfile gracefully", async () => {
    mockPosStore.posProfile = null;
    getOpenPosOpeningEntriesMock.mockResolvedValueOnce([]);

    render(<OpenEntries />);

    await waitFor(() => {
      expect(screen.getByText("Open Sessions")).toBeInTheDocument();
      // Should not call the API
      expect(getOpenPosOpeningEntriesMock).not.toHaveBeenCalled();
    });

    // Reset for other tests
    mockPosStore.posProfile = { name: "POS-001", branch: "Kozhikode" };
  });
});
