import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import QuickActions from "./QuickActions";

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("../../context/BranchContext", () => ({
  useBranchContext: () => ({
    refreshDashboard: vi.fn(),
  }),
}));

describe("QuickActions", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders without errors", () => {
    const { container } = render(<QuickActions />);
    expect(container).toBeTruthy();
  });
});
