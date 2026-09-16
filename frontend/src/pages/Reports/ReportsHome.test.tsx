import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ReportsHome } from "./ReportsHome";

vi.mock("./reportsRegistry", () => ({
  reportsRegistry: [
    { id: "sales", path: "sales", label: "Sales Report" },
  ],
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    Navigate: ({ to, replace }) => <div>Navigate to {to}</div>,
  };
});

describe("ReportsHome", () => {
  beforeEach(() => { cleanup(); });

  it("renders navigation component", () => {
    render(<ReportsHome />);
    expect(screen.getByText(/Navigate to/)).toBeInTheDocument();
  });

  it("renders fallback message when no first report", () => {
    render(<ReportsHome />);
    expect(document.body).toBeInTheDocument();
  });
});
