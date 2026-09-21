import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import InsightFeed from "./InsightFeed";

vi.mock("./isPermissionError", () => ({
  isPermissionError: (error: any) => {
    return error?.status === 403 || error?.httpStatus === 403;
  },
}));

const mockInsights = [
  {
    name: "insight-1",
    title: "Low Stock Alert",
    severity: "Warning" as const,
    rule_key: "low_stock",
    branch: "Main Branch",
    source_tool: "inventory",
    body: "Items running low on stock",
    creation: "2024-01-01",
  },
  {
    name: "insight-2",
    title: "Critical Issue",
    severity: "Critical" as const,
    rule_key: "critical",
    branch: "Main Branch",
    source_tool: "pos",
    body: "System error detected",
    creation: "2024-01-01",
  },
];

const mockCall = {
  get: vi.fn(),
  post: vi.fn(),
};

vi.mock("@ury/core", () => ({
  call: mockCall,
}));

describe("InsightFeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCall.get.mockReset();
    mockCall.post.mockReset();
  });

  it("displays loading state initially", () => {
    mockCall.get.mockImplementation(() => new Promise(() => {}));
    render(<InsightFeed />);
    expect(screen.getByText(/Loading.../i)).toBeInTheDocument();
  });

  it("displays empty state when no insights", async () => {
    mockCall.get.mockResolvedValueOnce({ message: [] });

    render(<InsightFeed />);

    await waitFor(() => {
      expect(screen.getByText(/Nothing needs attention right now/i)).toBeInTheDocument();
    });
  });

  it("renders title", async () => {
    mockCall.get.mockResolvedValueOnce({ message: [] });

    render(<InsightFeed />);

    await waitFor(() => {
      expect(screen.getByText("Act now")).toBeInTheDocument();
    });
  });

  it("renders insights when data is loaded", async () => {
    mockCall.get.mockResolvedValueOnce({ message: mockInsights });

    render(<InsightFeed />);

    await waitFor(() => {
      expect(screen.getByText("Low Stock Alert")).toBeInTheDocument();
      expect(screen.getByText("Critical Issue")).toBeInTheDocument();
    });
  });

  it("shows error message on fetch failure", async () => {
    mockCall.get.mockRejectedValueOnce(new Error("Network error"));

    render(<InsightFeed />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load insights/i)).toBeInTheDocument();
    });
  });

  it("hides component on permission error", async () => {
    mockCall.get.mockRejectedValueOnce({ httpStatus: 403 });

    const { container } = render(<InsightFeed />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("includes branch in API call when provided", async () => {
    mockCall.get.mockResolvedValueOnce({ message: [] });

    render(<InsightFeed branch="Main Branch" />);

    await waitFor(() => {
      expect(mockCall.get).toHaveBeenCalledWith("ury.ury.api.ury_insight.get_active_insights", { branch: "Main Branch" });
    });
  });

  it("renders card component structure", async () => {
    mockCall.get.mockResolvedValueOnce({ message: mockInsights });

    const { container } = render(<InsightFeed />);

    await waitFor(() => {
      expect(container.querySelector(".bg-white")).toBeInTheDocument();
      expect(container.querySelector(".border")).toBeInTheDocument();
    });
  });

  it("calls dismiss_insight when dismiss button clicked", async () => {
    mockCall.get.mockResolvedValueOnce({ message: mockInsights });
    mockCall.post.mockResolvedValueOnce({ message: "ok" });

    render(<InsightFeed />);

    await waitFor(() => {
      expect(screen.getByText("Low Stock Alert")).toBeInTheDocument();
    });

    const dismissButtons = screen.getAllByLabelText("Dismiss");
    await userEvent.click(dismissButtons[0]);

    await waitFor(() => {
      expect(mockCall.post).toHaveBeenCalledWith("ury.ury.api.ury_insight.dismiss_insight", { name: "insight-1" });
    });
  });

  it("removes insight after dismissal", async () => {
    mockCall.get.mockResolvedValueOnce({ message: mockInsights });
    mockCall.post.mockResolvedValueOnce({ message: "ok" });

    render(<InsightFeed />);

    await waitFor(() => {
      expect(screen.getByText("Low Stock Alert")).toBeInTheDocument();
    });

    const dismissButtons = screen.getAllByLabelText("Dismiss");
    await userEvent.click(dismissButtons[0]);

    await waitFor(() => {
      expect(screen.queryByText("Low Stock Alert")).not.toBeInTheDocument();
    });
  });
});
