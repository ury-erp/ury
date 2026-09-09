import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import Header from "./Header";

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

vi.mock("../store/root-store", () => ({
  useRootStore: () => ({
    user: { full_name: "Test User", name: "test_user" },
    orderSearchQuery: "",
    setOrderSearchQuery: vi.fn(),
  }),
}));

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => ({
    searchQuery: "",
    setSearchQuery: vi.fn(),
  }),
}));

vi.mock("@ury/core", () => ({
  logout: vi.fn().mockResolvedValue(null),
}));

vi.mock("@ury/ui", async () => {
  const actual = await vi.importActual("@ury/ui");
  return {
    ...actual,
    showToast: { error: vi.fn() },
  };
});

describe("Header", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders header element", () => {
    const { container } = render(
      <BrowserRouter>
        <Header />
      </BrowserRouter>
    );
    expect(container.querySelector("header")).toBeInTheDocument();
  });

  it("has background styling", () => {
    const { container } = render(
      <BrowserRouter>
        <Header />
      </BrowserRouter>
    );
    const header = container.querySelector("header");
    expect(header).toHaveClass("bg-background");
  });

  it("renders content", () => {
    const { container } = render(
      <BrowserRouter>
        <Header />
      </BrowserRouter>
    );
    expect(container.textContent.length).toBeGreaterThan(0);
  });
});
