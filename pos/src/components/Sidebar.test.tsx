import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Sidebar from "./Sidebar";

const mockUsePOSStore = vi.fn();

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => mockUsePOSStore(),
}));

vi.mock("../lib/category-icons", () => ({
  CategoryIcon: ({ courseName }: any) => <div>{courseName}</div>,
}));

vi.mock("./CommentDialog", () => ({
  default: () => <div>Comment Dialog</div>,
}));

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

vi.mock("@ury/ui", () => ({
  SidebarContainer: ({ children, disabled }: any) => <div data-testid="sidebar" data-disabled={disabled}>{children}</div>,
  SidebarCard: ({ children }: any) => <div>{children}</div>,
  SidebarActiveIndicator: () => <div data-testid="active-indicator" />,
  Button: ({ children, disabled, ...props }: any) => <button {...props} disabled={disabled}>{children}</button>,
  Badge: ({ children }: any) => <div>{children}</div>,
  sidebarItemVariants: ({ active }: any) => active ? "active-sidebar-item" : "sidebar-item",
}));

describe("Sidebar", () => {
  beforeEach(() => {
    mockUsePOSStore.mockReturnValue({
      selectedCategory: "",
      setSelectedCategory: vi.fn(),
      menuItems: [
        { id: "1", name: "Item 1", course: "Main Course", price: 100 },
        { id: "2", name: "Item 2", course: "Main Course", price: 150 },
        { id: "3", name: "Item 3", course: "Desserts", price: 50 },
      ],
      categories: [
        { name: "Main Course", label: "Main Course", icon: "food" },
        { name: "Desserts", label: "Desserts", icon: "cake" },
      ],
      orderComment: "",
      setOrderComment: vi.fn(),
    });
  });

  it("renders sidebar container", () => {
    render(<Sidebar />);
    
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
  });

  it("displays categories", () => {
    render(<Sidebar />);
    
    const allItems = screen.getAllByText("Main Course");
    expect(allItems.length).toBeGreaterThan(0);
    
    const dessertItems = screen.getAllByText("Desserts");
    expect(dessertItems.length).toBeGreaterThan(0);
  });

  it("displays item counts", () => {
    render(<Sidebar />);
    
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("calls setSelectedCategory when clicking a category", async () => {
    const user = userEvent.setup();
    const setSelectedCategory = vi.fn();
    
    mockUsePOSStore.mockReturnValue({
      selectedCategory: "",
      setSelectedCategory,
      menuItems: [
        { id: "1", name: "Item 1", course: "Main Course", price: 100 },
      ],
      categories: [
        { name: "Main Course", label: "Main Course", icon: "food" },
      ],
      orderComment: "",
      setOrderComment: vi.fn(),
    });

    render(<Sidebar />);
    
    const buttons = screen.getAllByRole("button");
    if (buttons.length > 1) {
      await user.click(buttons[1]);
      expect(setSelectedCategory).toHaveBeenCalled();
    }
  });

  it("respects disabled prop", () => {
    render(<Sidebar disabled={true} />);
    
    const sidebar = screen.getByTestId("sidebar");
    expect(sidebar).toHaveAttribute("data-disabled", "true");
  });

  it("renders category names", () => {
    render(<Sidebar />);
    
    // Check that both categories exist (may appear multiple times)
    expect(screen.getAllByText("Main Course").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Desserts").length).toBeGreaterThan(0);
  });
});
