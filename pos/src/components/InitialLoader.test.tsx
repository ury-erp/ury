import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import InitialLoader from "./InitialLoader";

// Mock the i18n module
vi.mock("../i18n", () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      "common.loading": "Loading",
      "common.loading_ury_pos": "Loading URY POS",
      "common.please_wait_setup": "Please wait while we set up your session",
    };
    return translations[key] || key;
  },
}));

// Mock the @ury/ui Spinner component
vi.mock("@ury/ui", () => ({
  Spinner: ({ message }: { message: string }) => (
    <div data-testid="spinner">{message}</div>
  ),
}));

describe("InitialLoader", () => {
  it("renders the loader component", () => {
    const { container } = render(<InitialLoader />);
    expect(container.querySelector(".fixed")).toBeTruthy();
  });

  it("displays the loading message", () => {
    render(<InitialLoader />);
    expect(screen.getByText("Loading URY POS")).toBeInTheDocument();
  });

  it("displays the wait message", () => {
    render(<InitialLoader />);
    expect(
      screen.getByText("Please wait while we set up your session")
    ).toBeInTheDocument();
  });

  it("renders spinner component", () => {
    render(<InitialLoader />);
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });

  it("renders with centered layout", () => {
    const { container } = render(<InitialLoader />);
    const wrapper = container.querySelector(".inset-0");
    expect(wrapper).toHaveClass("flex");
    expect(wrapper).toHaveClass("items-center");
    expect(wrapper).toHaveClass("justify-center");
  });

  it("has full screen background", () => {
    const { container } = render(<InitialLoader />);
    const wrapper = container.querySelector(".fixed");
    expect(wrapper).toHaveClass("inset-0");
    expect(wrapper).toHaveClass("bg-white");
  });
});
