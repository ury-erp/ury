import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import CaptainMenu from "./CaptainMenu";

const mockUsePOSStore = vi.fn();

vi.mock("../../store/pos-store", () => ({
  usePOSStore: () => mockUsePOSStore(),
}));

vi.mock("../../components/MenuCard", () => ({
  default: ({ name, onClick }: any) => (
    <button onClick={onClick}>{name}</button>
  ),
}));

vi.mock("@ury/ui", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
  Spinner: ({ message }: any) => <div>{message}</div>,
}));

describe("CaptainMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state initially", () => {
    mockUsePOSStore.mockReturnValueOnce({
      menuItems: [],
      menuLoading: true,
      selectedCategory: "",
      setSelectedCategory: vi.fn(),
      searchQuery: "",
      setSearchQuery: vi.fn(),
      categories: [],
      fetchMenuItems: vi.fn(),
      addToOrder: vi.fn(),
      isOrderInteractionDisabled: () => false,
    });

    render(<CaptainMenu canAddItems={true} />);
    expect(screen.getByText(/Loading menu/)).toBeInTheDocument();
  });

  it("calls fetchMenuItems on mount", () => {
    const fetchMenuItems = vi.fn();
    mockUsePOSStore.mockReturnValueOnce({
      menuItems: [],
      menuLoading: false,
      selectedCategory: "",
      setSelectedCategory: vi.fn(),
      searchQuery: "",
      setSearchQuery: vi.fn(),
      categories: [],
      fetchMenuItems,
      addToOrder: vi.fn(),
      isOrderInteractionDisabled: () => false,
    });

    render(<CaptainMenu canAddItems={true} />);
    expect(fetchMenuItems).toHaveBeenCalled();
  });

  it("shows no items message when empty", () => {
    mockUsePOSStore.mockReturnValueOnce({
      menuItems: [],
      menuLoading: false,
      selectedCategory: "",
      setSelectedCategory: vi.fn(),
      searchQuery: "",
      setSearchQuery: vi.fn(),
      categories: [],
      fetchMenuItems: vi.fn(),
      addToOrder: vi.fn(),
      isOrderInteractionDisabled: () => false,
    });

    render(<CaptainMenu canAddItems={true} />);
    expect(screen.getByText("No items found.")).toBeInTheDocument();
  });
});
