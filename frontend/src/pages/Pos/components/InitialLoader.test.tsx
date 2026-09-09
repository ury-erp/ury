import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import InitialLoader from "./InitialLoader";

vi.mock("../i18n", () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      "common.loading": "Loading",
      "common.loading_ury_pos": "Loading URY POS",
      "common.please_wait_setup": "Please wait while we set up your POS",
    };
    return translations[key] || key;
  },
}));

describe("InitialLoader", () => {
  it("renders with correct text content", () => {
    render(<InitialLoader />);
    expect(screen.getByText("Loading URY POS")).toBeInTheDocument();
    expect(screen.getByText("Please wait while we set up your POS")).toBeInTheDocument();
  });

  it("has fixed fullscreen positioning", () => {
    const { container } = render(<InitialLoader />);
    const outerDiv = container.firstChild as HTMLElement;
    expect(outerDiv).toHaveClass("fixed", "inset-0");
  });

  it("centers content", () => {
    const { container } = render(<InitialLoader />);
    const outerDiv = container.firstChild as HTMLElement;
    expect(outerDiv).toHaveClass("flex", "items-center", "justify-center");
  });

  it("displays all text in centered layout", () => {
    const { container } = render(<InitialLoader />);
    const textContainer = container.querySelector(".text-center");
    expect(textContainer).toBeInTheDocument();
  });

  it("renders successfully without errors", () => {
    const { container } = render(<InitialLoader />);
    expect(container.firstChild).toBeTruthy();
  });
});
