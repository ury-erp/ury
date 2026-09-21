import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MergeLinkConnector from "./MergeLinkConnector";

vi.mock("../i18n", () => ({
  t: (key: string, params?: Record<string, any>) => {
    const translations: Record<string, string> = {
      "tables.merged_with_list": `Merged with ${params?.tables || ""}`,
    };
    return translations[key] || key;
  },
}));

describe("MergeLinkConnector", () => {
  it("renders with correct aria-label and title", () => {
    render(<MergeLinkConnector leftTable="Table 1" rightTable="Table 2" />);
    
    const element = screen.getByRole("img");
    expect(element).toHaveAttribute("aria-label", expect.stringContaining("Table 2"));
    expect(element).toHaveAttribute("title", expect.stringContaining("Table 1"));
    expect(element).toHaveAttribute("title", expect.stringContaining("Table 2"));
  });

  it("renders the Link2 icon", () => {
    const { container } = render(<MergeLinkConnector leftTable="A" rightTable="B" />);
    
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("has correct styling classes", () => {
    const { container } = render(<MergeLinkConnector leftTable="T1" rightTable="T2" />);
    
    const div = container.firstChild as HTMLElement;
    expect(div).toHaveClass("flex", "w-8", "shrink-0", "items-center", "justify-center");
  });
});
