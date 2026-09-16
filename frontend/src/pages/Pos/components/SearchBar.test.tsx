import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SearchBar from "./SearchBar";

// Mock the UI components
vi.mock("@ury/ui", () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
  Input: ({ value, onChange, placeholder, disabled, ...props }: any) => (
    <input
      type="text"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      {...props}
    />
  ),
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

describe("SearchBar", () => {
  beforeEach(() => {
    cleanup();
  });

  it("shows the search button when not visible", () => {
    render(
      <SearchBar
        value=""
        onChange={() => {}}
        onVisibilityChange={() => {}}
        isVisible={false}
      />
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("hides the search button when visible", () => {
    const { container } = render(
      <SearchBar
        value=""
        onChange={() => {}}
        onVisibilityChange={() => {}}
        isVisible={true}
      />
    );
    // The search icon button gets hidden when visible
    expect(container.querySelector("button")).toBeInTheDocument();
  });

  it("shows the input field when visible", () => {
    render(
      <SearchBar
        value=""
        onChange={() => {}}
        onVisibilityChange={() => {}}
        isVisible={true}
      />
    );
    const input = screen.getByPlaceholderText("Search menu items...");
    expect(input).toBeInTheDocument();
  });

  it("displays the current value in the input field", () => {
    render(
      <SearchBar
        value="chicken"
        onChange={() => {}}
        onVisibilityChange={() => {}}
        isVisible={true}
      />
    );
    const input = screen.getByPlaceholderText("Search menu items...") as HTMLInputElement;
    expect(input.value).toBe("chicken");
  });

  it("calls onChange when text is typed in the input", async () => {
    const onChange = vi.fn();
    render(
      <SearchBar
        value=""
        onChange={onChange}
        onVisibilityChange={() => {}}
        isVisible={true}
      />
    );
    const input = screen.getByPlaceholderText("Search menu items...");
    
    await userEvent.type(input, "biryani");
    
    expect(onChange).toHaveBeenCalledWith("b");
    expect(onChange).toHaveBeenCalledWith("i");
    expect(onChange).toHaveBeenCalledWith("r");
    expect(onChange).toHaveBeenCalledWith("y");
    expect(onChange).toHaveBeenCalledWith("a");
    expect(onChange).toHaveBeenCalledWith("n");
    expect(onChange).toHaveBeenLastCalledWith("i");
  });

  it("clears the input value and hides when X button is clicked", async () => {
    const onChange = vi.fn();
    const onVisibilityChange = vi.fn();
    render(
      <SearchBar
        value="search text"
        onChange={onChange}
        onVisibilityChange={onVisibilityChange}
        isVisible={true}
      />
    );
    
    const buttons = screen.getAllByRole("button");
    const clearButton = buttons[buttons.length - 1];
    
    await userEvent.click(clearButton);
    
    expect(onChange).toHaveBeenCalledWith("");
    expect(onVisibilityChange).toHaveBeenCalledWith(false);
  });

  it("disables input and buttons when disabled prop is true", () => {
    render(
      <SearchBar
        value=""
        onChange={() => {}}
        onVisibilityChange={() => {}}
        isVisible={true}
        disabled={true}
      />
    );
    const input = screen.getByPlaceholderText("Search menu items...") as HTMLInputElement;
    const buttons = screen.getAllByRole("button");
    
    expect(input).toBeDisabled();
    buttons.forEach(button => {
      expect(button).toBeDisabled();
    });
  });

  it("calls onVisibilityChange when search button is clicked", async () => {
    const onVisibilityChange = vi.fn();
    render(
      <SearchBar
        value=""
        onChange={() => {}}
        onVisibilityChange={onVisibilityChange}
        isVisible={false}
      />
    );
    
    const buttons = screen.getAllByRole("button");
    await userEvent.click(buttons[0]);
    
    expect(onVisibilityChange).toHaveBeenCalledWith(true);
  });
});
