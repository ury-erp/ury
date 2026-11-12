import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { Header } from "./Header";

vi.mock("../../context/BranchContext", () => ({
  useBranchContext: () => ({
    activeBranchId: "branch-1",
    setActiveBranchId: vi.fn(),
    branches: [{ id: "branch-1", name: "Main Branch" }],
    activeBranch: { id: "branch-1", name: "Main Branch" },
  }),
}));

vi.mock("../../context/CompanyContext", () => ({
  useCompanyContext: () => ({
    activeCompanyId: "all",
    setActiveCompanyId: vi.fn(),
    companies: [],
    activeCompany: null,
  }),
}));

vi.mock("../DeskLink", () => ({
  useDeskPermission: () => ({ read: true }),
}));

vi.mock("./Breadcrumbs", () => ({
  Breadcrumbs: () => <div data-testid="breadcrumbs">Breadcrumbs</div>,
}));

vi.mock("../chat/AskBar", () => ({
  default: () => <div data-testid="ask-bar">AskBar</div>,
}));

vi.mock("@ury/core", () => ({
  logout: vi.fn().mockResolvedValue(undefined),
  call: Object.assign(vi.fn().mockResolvedValue({ message: [] }), {
    get: vi.fn().mockResolvedValue({ message: [] }),
    post: vi.fn().mockResolvedValue({ message: [] }),
  }),
  getLoggedUser: () => "admin@urypos.com",
  getUserRoles: () => ["System Manager"],
  withReturnContext: (path: string) => path,
  appLabelForPath: () => "URY",
  DESK_RETURN_STORAGE_KEY: "ury:desk_return_to",
}));

vi.mock("@ury/ui", async () => {
  const actual = await vi.importActual("@ury/ui");
  return {
    ...actual,
    messageToPlainText: (msg: string) => msg,
  };
});

vi.mock("../../i18n", () => ({
  __: (str: string) => str,
  uiLocale: () => "en",
}));

describe("Header (/ury)", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("renders URY logo linking to /desk", () => {
    render(
      <BrowserRouter>
        <Header />
      </BrowserRouter>
    );

    const logo = screen.getByAltText("URY Logo");
    expect(logo).toBeInTheDocument();

    const logoLink = logo.closest("a");
    expect(logoLink).toHaveAttribute("href", "/desk");
  });

  it("sets return context in sessionStorage when URY logo is clicked", async () => {
    render(
      <BrowserRouter>
        <Header />
      </BrowserRouter>
    );

    const logo = screen.getByAltText("URY Logo");
    const logoLink = logo.closest("a");
    expect(logoLink).not.toBeNull();

    logoLink?.addEventListener("click", (e) => e.preventDefault());
    await userEvent.click(logoLink!);

    const stored = sessionStorage.getItem("ury:desk_return_to");
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.label).toBe("URY");
  });
});
