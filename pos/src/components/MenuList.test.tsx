import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MenuList from "./MenuList";

// Mock the i18n module
vi.mock("../i18n", () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      "common.loading_menu_items": "Loading menu items...",
      "common.error_loading_menu_items": "Error loading menu items",
      "common.no_items_found": "No items found",
      "common.try_adjusting_filters": "Try adjusting your filters",
    };
    return translations[key] || key;
  },
}));

// Mock UI components
vi.mock("@ury/ui", () => ({
  Spinner: ({ message }: { message: string }) => (
    <div data-testid="spinner">{message}</div>
  ),
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

// Mock the MenuCard component
vi.mock("./MenuCard", () => ({
  default: ({ 
    name, 
    price, 
    onClick, 
    disabled 
  }: any) => (
    <div
      data-testid="menu-card"
      onClick={onClick}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      {name} - Rs. {price}
    </div>
  ),
}));

// Mock the store
const usePOSStoreMock = vi.fn();
vi.mock("../store/pos-store", () => ({
  usePOSStore: (...args: any[]) => usePOSStoreMock(...args),
}));

describe("MenuList", () => {
  const mockMenuItems = [
    {
      id: "1",
      name: "Chicken Biryani",
      item: "ITEM-BIRYANI",
      price: 250,
      course: "Main Course",
      course_label: "Main Course",
      image: null,
      special_dish: 0,
    },
    {
      id: "2",
      name: "Paneer Tikka",
      item: "ITEM-TIKKA",
      price: 180,
      course: "Appetizer",
      course_label: "Appetizer",
      image: null,
      special_dish: 1,
    },
  ];

  beforeEach(() => {
    usePOSStoreMock.mockReset();

    usePOSStoreMock.mockReturnValue({
      menuItems: mockMenuItems,
      menuLoading: false,
      error: null,
      selectedCategory: null,
      searchQuery: "",
      quickFilter: "all",
      fetchMenuItems: vi.fn(),
      isMenuInteractionDisabled: vi.fn(() => false),
      isOrderInteractionDisabled: vi.fn(() => false),
      posProfile: { branch: "Kozhikode", company: "URY" },
    });
  });

  it("renders menu list", async () => {
    render(<MenuList onItemClick={() => {}} />);
    
    await waitFor(() => {
      expect(screen.getAllByTestId("menu-card").length).toBeGreaterThan(0);
    });
  });

  it("displays all menu items when no filters applied", async () => {
    render(<MenuList onItemClick={() => {}} />);

    await waitFor(() => {
      const cards = screen.getAllByTestId("menu-card");
      expect(cards).toHaveLength(2);
    });
  });

  it("calls fetchMenuItems on mount", () => {
    const fetchMenuItems = vi.fn();
    usePOSStoreMock.mockReturnValueOnce({
      menuItems: mockMenuItems,
      menuLoading: false,
      error: null,
      selectedCategory: null,
      searchQuery: "",
      quickFilter: "all",
      fetchMenuItems,
      isMenuInteractionDisabled: vi.fn(() => false),
      isOrderInteractionDisabled: vi.fn(() => false),
      posProfile: { branch: "Kozhikode", company: "URY" },
    });

    render(<MenuList onItemClick={() => {}} />);

    expect(fetchMenuItems).toHaveBeenCalled();
  });

  it("shows loading state", () => {
    usePOSStoreMock.mockReturnValueOnce({
      menuItems: [],
      menuLoading: true,
      error: null,
      selectedCategory: null,
      searchQuery: "",
      quickFilter: "all",
      fetchMenuItems: vi.fn(),
      isMenuInteractionDisabled: vi.fn(() => false),
      isOrderInteractionDisabled: vi.fn(() => false),
      posProfile: { branch: "Kozhikode", company: "URY" },
    });

    render(<MenuList onItemClick={() => {}} />);

    expect(screen.getByTestId("spinner")).toBeInTheDocument();
    expect(screen.getByText("Loading menu items...")).toBeInTheDocument();
  });

  it("shows error state", () => {
    usePOSStoreMock.mockReturnValueOnce({
      menuItems: [],
      menuLoading: false,
      error: "Failed to load menu",
      selectedCategory: null,
      searchQuery: "",
      quickFilter: "all",
      fetchMenuItems: vi.fn(),
      isMenuInteractionDisabled: vi.fn(() => false),
      isOrderInteractionDisabled: vi.fn(() => false),
      posProfile: { branch: "Kozhikode", company: "URY" },
    });

    render(<MenuList onItemClick={() => {}} />);

    expect(screen.getByText("Error loading menu items")).toBeInTheDocument();
    expect(screen.getByText("Failed to load menu")).toBeInTheDocument();
  });

  it("shows empty state when no items found", () => {
    usePOSStoreMock.mockReturnValueOnce({
      menuItems: [],
      menuLoading: false,
      error: null,
      selectedCategory: null,
      searchQuery: "xyz",
      quickFilter: "all",
      fetchMenuItems: vi.fn(),
      isMenuInteractionDisabled: vi.fn(() => false),
      isOrderInteractionDisabled: vi.fn(() => false),
      posProfile: { branch: "Kozhikode", company: "URY" },
    });

    render(<MenuList onItemClick={() => {}} />);

    expect(screen.getByText("No items found")).toBeInTheDocument();
    expect(screen.getByText("Try adjusting your filters")).toBeInTheDocument();
  });

  it("calls onItemClick when menu card is clicked", async () => {
    const user = userEvent.setup();
    const onItemClick = vi.fn();

    render(<MenuList onItemClick={onItemClick} />);

    await waitFor(() => {
      expect(screen.getAllByTestId("menu-card").length).toBeGreaterThan(0);
    });

    const cards = screen.getAllByTestId("menu-card");
    await user.click(cards[0]);

    expect(onItemClick).toHaveBeenCalled();
  });

  it("filters items by search query", () => {
    usePOSStoreMock.mockReturnValueOnce({
      menuItems: mockMenuItems,
      menuLoading: false,
      error: null,
      selectedCategory: null,
      searchQuery: "Biryani",
      quickFilter: "all",
      fetchMenuItems: vi.fn(),
      isMenuInteractionDisabled: vi.fn(() => false),
      isOrderInteractionDisabled: vi.fn(() => false),
      posProfile: { branch: "Kozhikode", company: "URY" },
    });

    render(<MenuList onItemClick={() => {}} />);

    const cards = screen.getAllByTestId("menu-card");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent("Chicken Biryani");
  });

  it("disables interaction when isMenuInteractionDisabled is true", () => {
    usePOSStoreMock.mockReturnValueOnce({
      menuItems: mockMenuItems,
      menuLoading: false,
      error: null,
      selectedCategory: null,
      searchQuery: "",
      quickFilter: "all",
      fetchMenuItems: vi.fn(),
      isMenuInteractionDisabled: vi.fn(() => true),
      isOrderInteractionDisabled: vi.fn(() => false),
      posProfile: { branch: "Kozhikode", company: "URY" },
    });

    const { container } = render(<MenuList onItemClick={() => {}} />);

    const gridContainer = container.querySelector(
      ".grid"
    );
    expect(gridContainer).toHaveClass("opacity-50");
    expect(gridContainer).toHaveClass("pointer-events-none");
  });
});
