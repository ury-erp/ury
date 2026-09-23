import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MenuList from "./MenuList";

const usePOSStoreMock = vi.fn();
vi.mock("../store/pos-store", () => ({ usePOSStore: () => usePOSStoreMock() }));
vi.mock("../i18n", () => ({ t: (key: string) => key }));
vi.mock("./MenuCard", () => ({ default: ({ name, onClick }: any) => <div data-testid={`menu-card-${name}`} onClick={onClick}>{name}</div> }));

const mockMenuItems = [
  { id: "1", name: "Biryani", course: "Main Course", item: "ITEM-1", price: 250, course_label: "Main", image: null, special_dish: 0 },
  { id: "2", name: "Dosa", course: "Breakfast", item: "ITEM-2", price: 150, course_label: "Breakfast", image: null, special_dish: 1 },
];

const defaultStoreState = {
  menuItems: [],
  menuLoading: false,
  error: null,
  selectedCategory: null,
  searchQuery: "",
  quickFilter: "all",
  fetchMenuItems: vi.fn(),
  isMenuInteractionDisabled: vi.fn(() => false),
  isOrderInteractionDisabled: vi.fn(() => false),
  posProfile: { branch: "Kozhikode", company: "URY" },
};

describe("MenuList", () => {
  beforeEach(() => { cleanup(); vi.clearAllMocks(); });
  
  it("calls fetchMenuItems on mount", () => {
    const fetchMenuItems = vi.fn();
    usePOSStoreMock.mockReturnValue({ ...defaultStoreState, fetchMenuItems });
    render(<MenuList onItemClick={vi.fn()} />);
    expect(fetchMenuItems).toHaveBeenCalled();
  });

  it("displays loading state when menuLoading is true", () => {
    usePOSStoreMock.mockReturnValue({ ...defaultStoreState, menuLoading: true });
    render(<MenuList onItemClick={vi.fn()} />);
    expect(screen.getByText("common.loading_menu_items")).toBeInTheDocument();
  });

  it("displays error state when error exists", () => {
    usePOSStoreMock.mockReturnValue({ ...defaultStoreState, error: "Load failed" });
    render(<MenuList onItemClick={vi.fn()} />);
    expect(screen.getByText("Load failed")).toBeInTheDocument();
  });

  it("displays no items message when filtered items are empty", () => {
    usePOSStoreMock.mockReturnValue({ ...defaultStoreState, menuItems: mockMenuItems, selectedCategory: "Dessert" });
    render(<MenuList onItemClick={vi.fn()} />);
    expect(screen.getByText("common.no_items_found")).toBeInTheDocument();
  });

  it("displays menu items when available", () => {
    usePOSStoreMock.mockReturnValue({ ...defaultStoreState, menuItems: mockMenuItems });
    render(<MenuList onItemClick={vi.fn()} />);
    expect(screen.getByTestId("menu-card-Biryani")).toBeInTheDocument();
    expect(screen.getByTestId("menu-card-Dosa")).toBeInTheDocument();
  });

  it("filters by category", () => {
    usePOSStoreMock.mockReturnValue({ ...defaultStoreState, menuItems: mockMenuItems, selectedCategory: "Breakfast" });
    render(<MenuList onItemClick={vi.fn()} />);
    expect(screen.queryByTestId("menu-card-Biryani")).not.toBeInTheDocument();
    expect(screen.getByTestId("menu-card-Dosa")).toBeInTheDocument();
  });

  it("calls onItemClick when card is clicked", async () => {
    const onItemClick = vi.fn();
    usePOSStoreMock.mockReturnValue({ ...defaultStoreState, menuItems: mockMenuItems });
    const user = userEvent.setup();
    render(<MenuList onItemClick={onItemClick} />);
    await user.click(screen.getByTestId("menu-card-Biryani"));
    expect(onItemClick).toHaveBeenCalled();
  });

  it("disables interaction when isMenuInteractionDisabled returns true", () => {
    usePOSStoreMock.mockReturnValue({ ...defaultStoreState, menuItems: mockMenuItems, isMenuInteractionDisabled: vi.fn(() => true) });
    const { container } = render(<MenuList onItemClick={vi.fn()} />);
    const grid = container.querySelector("[style*=grid]") as HTMLElement;
    expect(grid?.className).toContain("opacity-50");
  });

  it("renders in-stock items before sold out and temporarily unavailable items", async () => {
    const { sortMenuItemsByAvailability } = await import("../lib/use-menu-availability");
    const testItems = [
      { id: "1", name: "Apple Pie", item: "APPLE", price: 100, course: "Dessert", image: null, special_dish: 0 },
      { id: "2", name: "Biryani", item: "BIRYANI", price: 250, course: "Main", image: null, special_dish: 0 },
      { id: "3", name: "Cake", item: "CAKE", price: 150, course: "Dessert", image: null, special_dish: 0 },
    ];

    const availabilityMap: any = {
      APPLE: { item_code: "APPLE", sellable: false, available_qty: 0, reason_code: "PLAN_EXHAUSTED" },
      BIRYANI: { item_code: "BIRYANI", sellable: true, available_qty: 10, reason_code: "AVAILABLE" },
      CAKE: { item_code: "CAKE", sellable: false, available_qty: 0, reason_code: "BLOCKING_COMPONENT" },
    };

    const sorted = sortMenuItemsByAvailability(testItems, availabilityMap);
    expect(sorted.map(i => i.name)).toEqual(["Biryani", "Apple Pie", "Cake"]);
  });
});
