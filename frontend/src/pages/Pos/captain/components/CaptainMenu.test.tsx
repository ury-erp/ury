import { render, screen, cleanup } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CaptainMenu from "./CaptainMenu";

const mockUsePOSStore = vi.fn();

vi.mock("../../store/pos-store", () => ({
  usePOSStore: () => mockUsePOSStore(),
}));

vi.mock("../../components/MenuCard", () => ({
  default: ({ name, price, onClick }: any) => (
    <button onClick={onClick} data-testid={`menu-card-${name}`}>
      {name} - Rs. {price}
    </button>
  ),
}));

vi.mock("@ury/ui", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
  Spinner: ({ message }: { message: string }) => (
    <div data-testid="spinner">{message}</div>
  ),
}));

const mockMenuItems = [
  {
    id: "1",
    name: "Chicken Biryani",
    price: 250,
    item: "ITEM-1",
    course: "Main",
    course_label: "Main Course",
    image: null,
  },
  {
    id: "2",
    name: "Paneer Tikka",
    price: 200,
    item: "ITEM-2",
    course: "Starter",
    course_label: "Starter",
    image: null,
  },
];

const mockCategories = [
  { name: "Main", label: "Main Course" },
  { name: "Starter", label: "Starter" },
];

describe("CaptainMenu", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders menu with search and category filters", () => {
    mockUsePOSStore.mockReturnValue({
      menuItems: mockMenuItems,
      menuLoading: false,
      selectedCategory: "",
      setSelectedCategory: vi.fn(),
      searchQuery: "",
      setSearchQuery: vi.fn(),
      categories: mockCategories,
      fetchMenuItems: vi.fn(),
      addToOrder: vi.fn(),
      isOrderInteractionDisabled: () => false,
    });

    render(<CaptainMenu canAddItems={true} />);

    expect(screen.getByPlaceholderText(/search menu/i)).toBeInTheDocument();
  });

  it("shows loading state when menuLoading is true", () => {
    mockUsePOSStore.mockReturnValue({
      menuItems: [],
      menuLoading: true,
      selectedCategory: "",
      setSelectedCategory: vi.fn(),
      searchQuery: "",
      setSearchQuery: vi.fn(),
      categories: mockCategories,
      fetchMenuItems: vi.fn(),
      addToOrder: vi.fn(),
      isOrderInteractionDisabled: () => false,
    });

    render(<CaptainMenu canAddItems={true} />);

    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });

  it("displays menu items in a grid", () => {
    mockUsePOSStore.mockReturnValue({
      menuItems: mockMenuItems,
      menuLoading: false,
      selectedCategory: "",
      setSelectedCategory: vi.fn(),
      searchQuery: "",
      setSearchQuery: vi.fn(),
      categories: mockCategories,
      fetchMenuItems: vi.fn(),
      addToOrder: vi.fn(),
      isOrderInteractionDisabled: () => false,
    });

    render(<CaptainMenu canAddItems={true} />);

    expect(screen.getByTestId("menu-card-Chicken Biryani")).toBeInTheDocument();
    expect(screen.getByTestId("menu-card-Paneer Tikka")).toBeInTheDocument();
  });

  it("shows warning message when canAddItems is false", () => {
    mockUsePOSStore.mockReturnValue({
      menuItems: mockMenuItems,
      menuLoading: false,
      selectedCategory: "",
      setSelectedCategory: vi.fn(),
      searchQuery: "",
      setSearchQuery: vi.fn(),
      categories: mockCategories,
      fetchMenuItems: vi.fn(),
      addToOrder: vi.fn(),
      isOrderInteractionDisabled: () => false,
    });

    render(<CaptainMenu canAddItems={false} />);

    expect(screen.getByText(/you don't have permission/i)).toBeInTheDocument();
  });

  it("shows no items message when menu is empty", () => {
    mockUsePOSStore.mockReturnValue({
      menuItems: [],
      menuLoading: false,
      selectedCategory: "",
      setSelectedCategory: vi.fn(),
      searchQuery: "nonexistent",
      setSearchQuery: vi.fn(),
      categories: mockCategories,
      fetchMenuItems: vi.fn(),
      addToOrder: vi.fn(),
      isOrderInteractionDisabled: () => false,
    });

    render(<CaptainMenu canAddItems={true} />);

    expect(screen.getByText(/no items found/i)).toBeInTheDocument();
  });
});
