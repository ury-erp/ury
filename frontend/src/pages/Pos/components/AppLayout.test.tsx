import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import AppLayout from "./AppLayout";

vi.mock("./Header", () => ({
  default: () => <div>Header</div>,
}));

vi.mock("./Footer", () => ({
  default: () => <div>Footer</div>,
}));

describe("AppLayout", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders layout component", () => {
    const { container } = render(<AppLayout />);
    expect(container.querySelector(".flex")).toBeInTheDocument();
  });

  it("has h-screen class", () => {
    const { container } = render(<AppLayout />);
    const layoutDiv = container.querySelector(".h-screen");
    expect(layoutDiv).toBeInTheDocument();
  });

  it("has bg-background class", () => {
    const { container } = render(<AppLayout />);
    const layoutDiv = container.querySelector(".bg-background");
    expect(layoutDiv).toBeInTheDocument();
  });

  it("renders header and footer mocks", () => {
    const { container } = render(<AppLayout />);
    expect(container.textContent).toContain("Header");
    expect(container.textContent).toContain("Footer");
  });
});
