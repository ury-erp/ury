import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { cleanup } from "@testing-library/react";
import OpenEntries from "./OpenEntries";

const getOpenPosOpeningEntriesMock = vi.fn();

vi.mock("../lib/pos-closing-api", () => ({
  getOpenPosOpeningEntries: (...args: any[]) => getOpenPosOpeningEntriesMock(...args),
}));

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => ({
    posProfile: { name: "POS-001" },
  }),
}));

vi.mock("../i18n", () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      "common.loading": "Loading...",
    };
    return translations[key] || key;
  },
}));

vi.mock("@ury/ui", () => ({
  Card: ({ children, className }: any) => <div data-testid="card" className={className}>{children}</div>,
  CardContent: ({ children, className }: any) => <div data-testid="card-content" className={className}>{children}</div>,
  Spinner: () => <div data-testid="spinner">Loading...</div>,
  DataTable: ({ rows, columns }: any) => (
    <table data-testid="data-table">
      <thead>
        <tr>
          {columns.map((col: any) => <th key={col.key}>{col.header}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row: any, idx: number) => (
          <tr key={idx}>
            {columns.map((col: any) => (
              <td key={col.key}>{col.render ? col.render(row) : (row as any)[col.key]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

describe("OpenEntries", () => {
  beforeEach(() => {
    cleanup();
    getOpenPosOpeningEntriesMock.mockReset();
  });

  it("renders the page with title", () => {
    getOpenPosOpeningEntriesMock.mockResolvedValueOnce([]);
    render(<OpenEntries />);
    expect(screen.getByText("Open Sessions")).toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    getOpenPosOpeningEntriesMock.mockImplementation(
      () => new Promise(() => {}) // never resolves
    );
    render(<OpenEntries />);
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });

  it("displays entries in a table when data loads", async () => {
    const mockEntries = [
      {
        user: "user1@test.com",
        period_start_date: "2024-01-01 10:00:00",
        pos_profile: "POS-001",
      },
      {
        user: "user2@test.com",
        period_start_date: "2024-01-02 11:00:00",
        pos_profile: "POS-002",
      },
    ];
    getOpenPosOpeningEntriesMock.mockResolvedValueOnce(mockEntries);

    render(<OpenEntries />);

    await waitFor(() => {
      expect(screen.getByTestId("data-table")).toBeInTheDocument();
    });

    expect(screen.getByText("user1@test.com")).toBeInTheDocument();
    expect(screen.getByText("user2@test.com")).toBeInTheDocument();
  });

  it("displays no entries message when list is empty", async () => {
    getOpenPosOpeningEntriesMock.mockResolvedValueOnce([]);

    render(<OpenEntries />);

    await waitFor(() => {
      expect(screen.getByText("No open POS sessions")).toBeInTheDocument();
    });
  });

  it("displays error message on fetch failure", async () => {
    getOpenPosOpeningEntriesMock.mockRejectedValueOnce(new Error("Fetch failed"));

    render(<OpenEntries />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load open sessions")).toBeInTheDocument();
    });
  });

  it("formats date correctly", async () => {
    const mockEntries = [
      {
        user: "user1@test.com",
        period_start_date: "2024-01-01T10:30:00Z",
        pos_profile: "POS-001",
      },
    ];
    getOpenPosOpeningEntriesMock.mockResolvedValueOnce(mockEntries);

    render(<OpenEntries />);

    await waitFor(() => {
      expect(screen.getByTestId("data-table")).toBeInTheDocument();
      const dateText = screen.getByText(/Jan 1, 2024/);
      expect(dateText).toBeInTheDocument();
    });
  });
});
