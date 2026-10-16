import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Header from "./Header";
import { BrowserRouter } from "react-router-dom";

const { mockIsPrintStatusDisabled } = vi.hoisted(() => ({
  mockIsPrintStatusDisabled: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useLocation: () => ({ pathname: "/register" }),
    useNavigate: () => vi.fn(),
  };
});

vi.mock("@ury/core", () => ({
  logout: vi.fn().mockResolvedValue(undefined),
  withReturnContext: (path: string) => path,
  formatCurrency: (amount: number) => `Rs. ${amount}`,
  isPrintStatusDisabled: mockIsPrintStatusDisabled,
}));

vi.mock("./PrinterWatch", () => ({
  PrinterStatusButton: () => (
    <button type="button" data-testid="printer-status-button">
      Printer Status
    </button>
  ),
}));

vi.mock("../store/root-store", () => ({
  useRootStore: (selector: any) => {
    const state = {
      user: {
        name: "test_user",
        full_name: "Test User",
      },
      orderSearchQuery: "",
      setOrderSearchQuery: vi.fn(),
    };
    return typeof selector === "function" ? selector(state) : state;
  },
}));

vi.mock("../store/pos-store", () => ({
  usePOSStore: () => ({
    searchQuery: "",
    setSearchQuery: vi.fn(),
    setShowVoluntaryClosing: vi.fn(),
    posProfile: {},
  }),
}));

vi.mock("@ury/ui", async () => {
  const actual = await vi.importActual("@ury/ui");
  return {
    ...actual,
    showToast: {
      error: vi.fn(),
    },
  };
});

vi.mock("../i18n", () => ({
  t: (key: string) => key,
}));

describe("Header", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    mockIsPrintStatusDisabled.mockReturnValue(false);
  });

  it("renders the header", () => {
    render(
      <BrowserRouter>
        <Header />
      </BrowserRouter>
    );

    expect(screen.getByAltText("URY POS")).toBeInTheDocument();
  });

  it("renders the search bar with appropriate placeholder", () => {
    render(
      <BrowserRouter>
        <Header />
      </BrowserRouter>
    );

    const searchInput = screen.getByPlaceholderText("header.search_placeholder_menu");
    expect(searchInput).toBeInTheDocument();
  });

  it("opens user menu when user button is clicked", async () => {
    render(
      <BrowserRouter>
        <Header />
      </BrowserRouter>
    );

    const userButton = screen.getByRole("button", { name: /Test User/i });
    await userEvent.click(userButton);

    expect(screen.getByText("header.close_shift")).toBeInTheDocument();
  });

  it("displays user menu options when menu is open", async () => {
    render(
      <BrowserRouter>
        <Header />
      </BrowserRouter>
    );

    const userButton = screen.getByRole("button", { name: /Test User/i });
    await userEvent.click(userButton);

    expect(screen.getByText("header.logout")).toBeInTheDocument();
    expect(screen.getByText("header.clear_cache")).toBeInTheDocument();
  });

  it("renders logo link to dashboard", () => {
    render(
      <BrowserRouter>
        <Header />
      </BrowserRouter>
    );

    const logoLink = screen.getByAltText("URY POS").closest("a");
    expect(logoLink).toHaveAttribute("href", "/dashboard");
  });

  it("renders the printer status button next to the user menu when enabled", () => {
    render(
      <BrowserRouter>
        <Header />
      </BrowserRouter>
    );

    const printerButton = screen.getByTestId("printer-status-button");
    expect(printerButton).toBeInTheDocument();

    const userButton = screen.getByRole("button", { name: /Test User/i });
    // The printer button must sit immediately before the user menu in the
    // right-side actions group.
    expect(
      printerButton.compareDocumentPosition(userButton) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("hides the printer status button when print status is disabled", () => {
    mockIsPrintStatusDisabled.mockReturnValue(true);

    render(
      <BrowserRouter>
        <Header />
      </BrowserRouter>
    );

    expect(screen.queryByTestId("printer-status-button")).not.toBeInTheDocument();
  });

  it("renders only one user menu and one printer button", () => {
    render(
      <BrowserRouter>
        <Header />
      </BrowserRouter>
    );

    expect(screen.getAllByRole("button", { name: /Test User/i })).toHaveLength(1);
    expect(screen.getAllByTestId("printer-status-button")).toHaveLength(1);
  });
});
