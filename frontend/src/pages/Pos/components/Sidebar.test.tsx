import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Sidebar from "./Sidebar";

const mockSetSelectedCategory = vi.fn();
const mockSetOrderComment = vi.fn();

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => ({
    selectedCategory: "",
    setSelectedCategory: mockSetSelectedCategory,
    menuItems: [
      { id: "1", name: "Biryani", course: "Main Course" },
      { id: "2", name: "Dosa", course: "Breakfast" },
      { id: "3", name: "Naan", course: "Bread" },
      { id: "4", name: "Samosa", course: "Main Course" },
    ],
    categories: [
      { name: "Main Course", label: "Main Course", icon: "icon1" },
      { name: "Breakfast", label: "Breakfast", icon: "icon2" },
      { name: "Bread", label: "Bread", icon: "icon3" },
    ],
    orderComment: "",
    setOrderComment: mockSetOrderComment,
  }),
}));

vi.mock("../lib/category-icons", () => ({
  CategoryIcon: ({ name }: any) => <div data-testid="category-icon">{name}</div>,
}));

vi.mock("./CommentDialog", () => ({
  default: ({ isOpen }: any) => (isOpen ? <div>Comment Dialog</div> : null),
}));

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

vi.mock("@ury/ui", () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
  Badge: ({ children, ...props }: any) => (
    <span {...props}>{children}</span>
  ),
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

describe("Sidebar", () => {
  beforeEach(() => {
    mockSetSelectedCategory.mockClear();
    mockSetOrderComment.mockClear();
  });

  it("renders sidebar container", () => {
    const { container } = render(<Sidebar />);
    const sidebar = container.querySelector(".w-64");
    expect(sidebar).toBeInTheDocument();
  });

  it("renders sidebar with correct styling", () => {
    const { container } = render(<Sidebar />);
    const sidebar = container.querySelector(".bg-card");
    expect(sidebar).toBeInTheDocument();
  });

  it("renders category buttons", () => {
    render(<Sidebar />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("calls setSelectedCategory when category button is clicked", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    const buttons = screen.getAllByRole("button");
    if (buttons.length > 1) {
      await user.click(buttons[1]);
      expect(mockSetSelectedCategory).toHaveBeenCalled();
    }
  });

  it("disables sidebar when disabled prop is true", () => {
    const { container } = render(<Sidebar disabled={true} />);
    const sidebar = container.querySelector(".opacity-50");
    expect(sidebar).toBeInTheDocument();
  });

  it("applies pointer-events-none when disabled", () => {
    const { container } = render(<Sidebar disabled={true} />);
    const sidebar = container.querySelector(".pointer-events-none");
    expect(sidebar).toBeInTheDocument();
  });
});
