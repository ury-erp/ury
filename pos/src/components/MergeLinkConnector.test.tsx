import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import MergeLinkConnector from "./MergeLinkConnector";

beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock("../i18n", () => ({
  t: (key: string, params?: Record<string, any>) => {
    if (key === "tables.merged_with_list" && params?.tables) {
      return `Merged with ${params.tables}`;
    }
    return key;
  },
}));

describe("MergeLinkConnector", () => {
  it("renders the link icon", () => {
    const { container } = render(
      <MergeLinkConnector leftTable="Table 1" rightTable="Table 2" />
    );
    const icon = container.querySelector(".lucide-link-2");
    expect(icon).toBeTruthy();
  });

  it("renders with correct accessibility label", () => {
    render(
      <MergeLinkConnector leftTable="Table 1" rightTable="Table 2" />
    );
    const container = screen.getByRole("img");
    expect(container).toHaveAttribute("aria-label");
  });

  it("includes table names in title attribute", () => {
    render(
      <MergeLinkConnector leftTable="Table 1" rightTable="Table 2" />
    );
    const container = screen.getByRole("img");
    expect(container).toHaveAttribute("title");
    const title = container.getAttribute("title");
    expect(title).toContain("Table 1");
    expect(title).toContain("Table 2");
  });

  it("renders with correct styling classes", () => {
    const { container } = render(
      <MergeLinkConnector leftTable="Table A" rightTable="Table B" />
    );
    const wrapper = container.firstChild;
    expect(wrapper).toHaveClass("flex");
    expect(wrapper).toHaveClass("w-8");
    expect(wrapper).toHaveClass("shrink-0");
  });
});
