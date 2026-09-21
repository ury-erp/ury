import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import Footer from "./Footer";

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

const renderFooter = () => {
  return render(
    <BrowserRouter>
      <Footer />
    </BrowserRouter>
  );
};

describe("Footer", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders navigation with all required items", () => {
    renderFooter();

    expect(screen.getByText("footer.dashboard")).toBeInTheDocument();
    expect(screen.getByText("footer.pos")).toBeInTheDocument();
    expect(screen.getByText("footer.tables")).toBeInTheDocument();
    expect(screen.getByText("footer.orders")).toBeInTheDocument();
    expect(screen.getByText("footer.sessions")).toBeInTheDocument();
    expect(screen.getByText("footer.settings")).toBeInTheDocument();
  });

  it("renders navigation links with correct paths", () => {
    renderFooter();

    const dashboardLink = screen.getByRole("link", { name: /footer.dashboard/i });
    const posLink = screen.getByRole("link", { name: /footer.pos/i });

    expect(dashboardLink).toHaveAttribute("href", "/pos/dashboard");
    expect(posLink).toHaveAttribute("href", "/pos/pos");
  });

  it("renders as a nav element", () => {
    const { container } = renderFooter();
    const nav = container.querySelector("nav");

    expect(nav).toBeInTheDocument();
    expect(nav).toHaveClass("h-[60px]");
  });

  it("shows visual indicator for active route", () => {
    // Simulate active route by setting location to a specific path
    window.history.pushState({}, "Dashboard", "/pos/dashboard");

    renderFooter();

    const dashboardLink = screen.getByRole("link", { name: /footer.dashboard/i });
    // NavLink adds "active" class when current route matches
    expect(dashboardLink).toHaveClass("text-primary");
  });
});
