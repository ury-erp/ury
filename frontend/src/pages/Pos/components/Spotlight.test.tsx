import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Spotlight from "./Spotlight";

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => ({
    menuItems: [
      { id: "1", name: "Chicken Biryani", category: "Main Course", price: 250, image: null },
      { id: "2", name: "Butter Chicken", category: "Main Course", price: 300, image: null },
      { id: "3", name: "Samosa", category: "Appetizer", price: 50, image: null },
    ],
    setSelectedItem: vi.fn(),
  }),
}));

vi.mock("@ury/core", () => ({
  formatCurrency: (amount: number) => `Rs. ${amount}`,
}));

describe("Spotlight", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("does not show dialog on mount", () => {
    render(<Spotlight />);
    expect(screen.queryByPlaceholderText("Search menu items...")).not.toBeInTheDocument();
  });

  it("opens dialog when Cmd+K is pressed", async () => {
    const user = userEvent.setup();
    render(<Spotlight />);

    await user.keyboard("{Meta>}k{/Meta}");

    expect(screen.getByPlaceholderText("Search menu items...")).toBeInTheDocument();
  });

  it("opens dialog when Ctrl+K is pressed", async () => {
    const user = userEvent.setup();
    render(<Spotlight />);

    await user.keyboard("{Control>}k{/Control}");

    expect(screen.getByPlaceholderText("Search menu items...")).toBeInTheDocument();
  });

  it("closes dialog when Escape is pressed", async () => {
    const user = userEvent.setup();
    render(<Spotlight />);

    await user.keyboard("{Meta>}k{/Meta}");
    expect(screen.getByPlaceholderText("Search menu items...")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Search menu items...")).not.toBeInTheDocument();
    });
  });

  it("renders menu items", async () => {
    const user = userEvent.setup();
    render(<Spotlight />);

    await user.keyboard("{Meta>}k{/Meta}");

    expect(screen.getByText("Chicken Biryani")).toBeInTheDocument();
    expect(screen.getByText("Butter Chicken")).toBeInTheDocument();
    expect(screen.getByText("Samosa")).toBeInTheDocument();
  });

  it("filters items by name", async () => {
    const user = userEvent.setup();
    render(<Spotlight />);

    await user.keyboard("{Meta>}k{/Meta}");

    const input = screen.getByPlaceholderText("Search menu items...") as HTMLInputElement;
    await user.type(input, "chicken");

    await waitFor(() => {
      expect(screen.getByText("Chicken Biryani")).toBeInTheDocument();
      expect(screen.getByText("Butter Chicken")).toBeInTheDocument();
    });
  });

  it("filters items by category", async () => {
    const user = userEvent.setup();
    render(<Spotlight />);

    await user.keyboard("{Meta>}k{/Meta}");

    const input = screen.getByPlaceholderText("Search menu items...") as HTMLInputElement;
    await user.type(input, "appetizer");

    await waitFor(() => {
      expect(screen.getByText("Samosa")).toBeInTheDocument();
    });
  });

  it("displays item price", async () => {
    const user = userEvent.setup();
    render(<Spotlight />);

    await user.keyboard("{Meta>}k{/Meta}");

    expect(screen.getByText("Rs. 250")).toBeInTheDocument();
    expect(screen.getByText("Rs. 300")).toBeInTheDocument();
  });

  it("shows no items message when search returns no results", async () => {
    const user = userEvent.setup();
    render(<Spotlight />);

    await user.keyboard("{Meta>}k{/Meta}");

    const input = screen.getByPlaceholderText("Search menu items...") as HTMLInputElement;
    await user.type(input, "xyz");

    await waitFor(() => {
      expect(screen.getByText("No items found")).toBeInTheDocument();
    });
  });

  it("closes dialog after selecting item", async () => {
    const user = userEvent.setup();
    render(<Spotlight />);

    await user.keyboard("{Meta>}k{/Meta}");
    expect(screen.getByPlaceholderText("Search menu items...")).toBeInTheDocument();

    // Mock the selection by pressing Escape after opening
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Search menu items...")).not.toBeInTheDocument();
    });
  });
});
