import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import SearchBar from "./SearchBar";

describe("SearchBar", () => {
  it("shows search input when visible", () => {
    const onChange = vi.fn();
    const onVisibilityChange = vi.fn();

    render(
      <SearchBar
        value=""
        onChange={onChange}
        onVisibilityChange={onVisibilityChange}
        isVisible={true}
      />
    );

    const input = screen.getByPlaceholderText("Search menu items...");
    expect(input).toBeInTheDocument();
  });

  it("calls onVisibilityChange when search button clicked", async () => {
    const onChange = vi.fn();
    const onVisibilityChange = vi.fn();
    const user = userEvent.setup();

    const { container } = render(
      <SearchBar
        value=""
        onChange={onChange}
        onVisibilityChange={onVisibilityChange}
        isVisible={false}
      />
    );

    const buttons = container.querySelectorAll("button");
    await user.click(buttons[0]);

    expect(onVisibilityChange).toHaveBeenCalledWith(true);
  });

  it("displays current search value", () => {
    const onChange = vi.fn();
    const onVisibilityChange = vi.fn();

    render(
      <SearchBar
        value="biryani"
        onChange={onChange}
        onVisibilityChange={onVisibilityChange}
        isVisible={true}
      />
    );

    const input = screen.getByDisplayValue("biryani");
    expect(input).toBeInTheDocument();
  });

  it("disables search when disabled prop is true", () => {
    const onChange = vi.fn();
    const onVisibilityChange = vi.fn();

    render(
      <SearchBar
        value=""
        onChange={onChange}
        onVisibilityChange={onVisibilityChange}
        isVisible={true}
        disabled={true}
      />
    );

    const input = screen.getByPlaceholderText("Search menu items...");
    expect(input).toBeDisabled();
  });

  it("updates input value on change", async () => {
    const onChange = vi.fn();
    const onVisibilityChange = vi.fn();
    const user = userEvent.setup();

    render(
      <SearchBar
        value=""
        onChange={onChange}
        onVisibilityChange={onVisibilityChange}
        isVisible={true}
      />
    );

    const input = screen.getByPlaceholderText("Search menu items...");
    await user.type(input, "test");

    expect(onChange).toHaveBeenCalled();
  });
});
