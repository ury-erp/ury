import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppLayout from "./AppLayout";

vi.mock("./Header", () => ({
  default: () => <div data-testid="header">Header</div>,
}));

vi.mock("./Footer", () => ({
  default: () => <div data-testid="footer">Footer</div>,
}));

describe("AppLayout", () => {
  const renderWithRouter = (component: React.ReactElement) => {
    return render(
      <BrowserRouter>
        <Routes>
          <Route element={component}>
            <Route path="/" element={<div>Page Content</div>} />
          </Route>
        </Routes>
      </BrowserRouter>
    );
  };

  it("renders header and footer", () => {
    renderWithRouter(<AppLayout />);

    expect(screen.getByTestId("header")).toBeInTheDocument();
    expect(screen.getByTestId("footer")).toBeInTheDocument();
  });

  it("renders outlet for page content", () => {
    renderWithRouter(<AppLayout />);

    expect(screen.getByText("Page Content")).toBeInTheDocument();
  });

  it("has proper layout structure", () => {
    const { container } = renderWithRouter(<AppLayout />);

    const layoutDiv = container.querySelector(".flex.flex-col.h-screen");
    expect(layoutDiv).toBeTruthy();
  });

  it("has proper styling for screen-height layout", () => {
    const { container } = renderWithRouter(<AppLayout />);

    const layoutDiv = container.querySelector(".bg-gray-100");
    expect(layoutDiv).toBeInTheDocument();
    expect(layoutDiv?.classList.contains("font-inter")).toBe(true);
  });

  it("content area has proper overflow handling", () => {
    const { container } = renderWithRouter(<AppLayout />);

    const contentDiv = container.querySelector(".flex-1");
    expect(contentDiv?.classList.contains("overflow-hidden")).toBe(true);
  });
});
