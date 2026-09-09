import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { TableShapeIcon } from "./TableShapeIcon";

describe("TableShapeIcon", () => {
  it("renders a rectangle icon by default", () => {
    const { container } = render(<TableShapeIcon />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders a circle icon when shape is Circle", () => {
    const { container } = render(<TableShapeIcon shape="Circle" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders a square icon when shape is Square", () => {
    const { container } = render(<TableShapeIcon shape="Square" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("applies the provided className", () => {
    const { container } = render(<TableShapeIcon className="w-4 h-4 text-primary" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("w-4", "h-4", "text-primary");
  });

  it("falls back to rectangle icon for unknown shape", () => {
    const { container } = render(<TableShapeIcon shape="Unknown" as any />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
