import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../i18n", () => ({
  t: (key) => key,
}));

vi.mock("@ury/ui", () => ({
  Card: ({ children, padding }) => <div>{children}</div>,
  CardContent: ({ children }) => <div>{children}</div>,
  KpiStrip: ({ data }) => <div>{data?.length ? "KpiStrip loaded" : "KpiStrip empty"}</div>,
  AttentionFeed: () => <div>AttentionFeed</div>,
  cn: (...args) => args.filter(Boolean).join(" "),
}));

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => ({
    posProfile: { branch: "Kozhikode" },
  }),
}));

vi.mock("../lib/pos-closing-api", () => ({
  getOpenPosOpeningEntries: vi.fn().mockResolvedValue([]),
}));

vi.mock("../components/dashboard/InsightFeed", () => ({
  default: () => <div>InsightFeed</div>,
}));

vi.mock("../components/chat/AskBar", () => ({
  default: () => <div>AskBar</div>,
}));

vi.mock("@ury/core", () => ({
  formatCurrency: (amount) => `Rs. ${amount}`,
  call: {
    get: vi.fn().mockResolvedValue({ message: {} }),
  },
}));

import Dashboard from "./Dashboard";

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders dashboard title components", async () => {
    render(<Dashboard />);

    await waitFor(() => {
      // The dashboard renders "Shift Overview" as the title
      expect(screen.getByText("Shift Overview")).toBeInTheDocument();
    });
  });

  it("renders main panels", async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("InsightFeed")).toBeInTheDocument();
      expect(screen.getByText("AskBar")).toBeInTheDocument();
    });
  });

  it("loads with posProfile from store", async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("InsightFeed")).toBeInTheDocument();
    });
  });

  it("renders dashboard structure", () => {
    const { container } = render(<Dashboard />);
    expect(container.querySelector("div")).toBeTruthy();
  });
});
