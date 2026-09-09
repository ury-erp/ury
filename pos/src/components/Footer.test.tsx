import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BrowserRouter } from "react-router-dom";
import Footer from "./Footer";

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

describe("Footer", () => {
  const renderWithRouter = (component: React.ReactElement) => {
    return render(
      <BrowserRouter>
        {component}
      </BrowserRouter>
    );
  };

  it("renders all navigation items", () => {
    renderWithRouter(<Footer />);

    expect(screen.getByText(/footer.dashboard/i)).toBeInTheDocument();
    expect(screen.getByText(/footer.pos/i)).toBeInTheDocument();
    expect(screen.getByText(/footer.tables/i)).toBeInTheDocument();
    expect(screen.getByText(/footer.orders/i)).toBeInTheDocument();
    expect(screen.getByText(/footer.sessions/i)).toBeInTheDocument();
    expect(screen.getByText(/footer.settings/i)).toBeInTheDocument();
  });

  it("renders navigation links with correct paths", () => {
    renderWithRouter(<Footer />);

    const dashboardLinks = screen.getAllByRole("link").filter(link => {
      return link.getAttribute("href") === "/dashboard" || link.getAttribute("href") === "/register" || link.getAttribute("href") === "/tables";
    });
    expect(dashboardLinks.length).toBeGreaterThan(0);
  });

  it("renders in a nav element", () => {
    const { container } = renderWithRouter(<Footer />);
    expect(container.querySelector("nav")).toBeInTheDocument();
  });

  it("has proper styling classes", () => {
    const { container } = renderWithRouter(<Footer />);
    
    const footer = container.querySelector(".border-t");
    expect(footer).toBeInTheDocument();
    expect(footer?.classList.contains("bg-white")).toBe(true);
  });

  it("renders all links as NavLink components", () => {
    renderWithRouter(<Footer />);

    const links = screen.getAllByRole("link");
    expect(links.length).toBe(6);
  });

  it("has clickable navigation links", () => {
    renderWithRouter(<Footer />);

    const links = screen.getAllByRole("link");
    links.forEach(link => {
      expect(link).toBeEnabled();
      expect(link.tagName).toBe("A");
    });
  });
});
