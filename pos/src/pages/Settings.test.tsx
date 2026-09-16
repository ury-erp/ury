import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../i18n", () => ({
  t: (key) => key,
}));

vi.mock("@ury/ui", () => ({
  Card: ({ children }) => <div>{children}</div>,
  CardContent: ({ children }) => <div>{children}</div>,
}));

vi.mock("../components/POSCloseFlow", () => ({
  default: () => <div>POSCloseFlow</div>,
}));

import Settings from "./Settings";

describe("Settings", () => {
  it("renders settings title", () => {
    render(<Settings />);
    expect(screen.getByText("settings.title")).toBeInTheDocument();
  });

  it("renders end of day section", () => {
    render(<Settings />);
    expect(screen.getByText("settings.end_of_day")).toBeInTheDocument();
  });

  it("renders POSCloseFlow component", () => {
    render(<Settings />);
    expect(screen.getByText("POSCloseFlow")).toBeInTheDocument();
  });

  it("renders coming soon message", () => {
    render(<Settings />);
    expect(screen.getByText("settings.coming_soon")).toBeInTheDocument();
  });

  it("has proper layout structure", () => {
    const { container } = render(<Settings />);
    expect(container.querySelector("h1")).toBeTruthy();
    expect(container.querySelector("h2")).toBeTruthy();
  });
});
